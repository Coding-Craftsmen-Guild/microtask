import { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it, vi } from 'vitest'
import { docConfig } from '../http/docs.js'
import { PROBLEM_MEDIA_TYPE } from '../http/problem.js'
import { SERVICE_KEY_SCHEME } from '../http/security.js'
import { validationHook } from '../http/validation-hook.js'
import {
  GUARDED_PREFIX,
  SERVICE_KEY,
  body,
  buildApp,
  buildDeps,
  testConfig,
} from '../testing/harness.js'
import type { ApiEnv } from './env.js'
import { createAuth } from './login.js'
import { requirePrincipal } from './require-principal.js'
import { PrincipalResolver } from './principal-resolver.js'
import { AdminVerifier } from './admin-verifier.js'

const LOGIN = '/v1/auth/login'

const attempt = (headers: Record<string, string>, password: unknown): RequestInit => ({
  method: 'POST',
  headers,
  body: JSON.stringify({ password }),
})

const serviceOnly = (): Record<string, string> => ({
  'x-api-key': SERVICE_KEY,
  'content-type': 'application/json',
})

const login = async (password: unknown = testConfig.adminPassword): Promise<Response> =>
  (await buildApp()).request(LOGIN, attempt(serviceOnly(), password))

const shapeOf = async (response: Response): Promise<Record<string, unknown>> => ({
  status: response.status,
  contentType: response.headers.get('content-type'),
  ...(await body(response)),
})

describe('POST /v1/auth/login', () => {
  it('exchanges the admin password for a short-lived token', async () => {
    const response = await login()
    expect(response.status).toBe(200)
    const session = await body(response)
    expect(typeof session['token']).toBe('string')
    expect(session['expiresInSeconds']).toBe(testConfig.adminTokenTtlSeconds)
    expect(typeof session['expiresAt']).toBe('string')
  })

  it('mints a token the guarded tree accepts, which is the whole point of the route', async () => {
    const app = await buildApp()
    const session = await body(await app.request(LOGIN, attempt(serviceOnly(), testConfig.adminPassword)))
    const response = await app.request(`${GUARDED_PREFIX}/projects`, {
      headers: { 'x-api-key': SERVICE_KEY, authorization: `Bearer ${String(session['token'])}` },
    })
    expect(response.status).toBe(200)
  })

  it('is reachable with no bearer token at all, since its job is to issue one', async () => {
    const response = await login()
    expect(response.status).toBe(200)
    expect(Object.keys(serviceOnly())).not.toContain('authorization')
  })

  it('still demands the service key, which says which app is calling', async () => {
    const response = await (await buildApp()).request(LOGIN, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: testConfig.adminPassword }),
    })
    expect(response.status).toBe(401)
  })
})

describe('the login route is not a password oracle', () => {
  it('answers a wrong password and an unknown service with the same document', async () => {
    const app = await buildApp()
    const wrongPassword = await app.request(LOGIN, attempt(serviceOnly(), 'not the password'))
    const unknownService = await app.request(LOGIN, {
      method: 'POST',
      headers: { 'x-api-key': 'k-not-ours', 'content-type': 'application/json' },
      body: JSON.stringify({ password: testConfig.adminPassword }),
    })
    expect(await shapeOf(wrongPassword)).toEqual(await shapeOf(unknownService))
    expect(wrongPassword.status).toBe(401)
  })

  it('answers a missing service key with that same document too', async () => {
    const app = await buildApp()
    const wrongPassword = await app.request(LOGIN, attempt(serviceOnly(), 'not the password'))
    const noKey = await app.request(LOGIN, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: testConfig.adminPassword }),
    })
    expect(await shapeOf(noKey)).toEqual(await shapeOf(wrongPassword))
  })

  it('serves that refusal as a problem document, like every other 401', async () => {
    const response = await login('not the password')
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(await body(response)).toMatchObject({ code: 'unauthorized' })
  })

  it('names neither the password nor the service in what it says', async () => {
    const said = JSON.stringify(await body(await login('not the password')))
    expect(said.toLowerCase()).not.toContain('password')
    expect(said).not.toContain(SERVICE_KEY)
  })

  it('tells the two apart in the log, which is where the distinction belongs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const app = await buildApp()
    await app.request(LOGIN, attempt(serviceOnly(), 'not the password'))
    await app.request(LOGIN, {
      method: 'POST',
      headers: { 'x-api-key': 'k-not-ours', 'content-type': 'application/json' },
      body: JSON.stringify({ password: testConfig.adminPassword }),
    })
    const lines = warn.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>)
    expect(lines).toEqual([
      { event: 'auth.login.refused', reason: 'wrong_password', service: 'microtask' },
      { event: 'auth.login.refused', reason: 'unknown_service', service: null },
    ])
    warn.mockRestore()
  })

  it('refuses a body with no password as a schema failure, after the service key is checked', async () => {
    const app = await buildApp()
    const malformed = await app.request(LOGIN, { method: 'POST', headers: serviceOnly(), body: '{}' })
    expect(malformed.status).toBe(422)
    const unkeyed = await app.request(LOGIN, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(unkeyed.status).toBe(401)
  })
})

describe('where the login route sits', () => {
  it('declares only the service key, because it is where a principal comes from', async () => {
    const paths = (await buildApp()).getOpenAPI31Document(docConfig).paths ?? {}
    const operation = (paths[LOGIN] as Record<string, { security?: unknown }> | undefined)?.['post']
    expect(operation?.security).toEqual([{ [SERVICE_KEY_SCHEME]: [] }])
  })

  it('sits outside the principal guard, and would be unreachable underneath it', async () => {
    const deps = await buildDeps()
    const guarded = new OpenAPIHono<ApiEnv>({ defaultHook: validationHook })
    const resolver = new PrincipalResolver({
      admin: new AdminVerifier({ config: deps.config, clock: deps.clock }),
      tokens: deps.tokens,
      store: deps.store,
    })
    guarded.use('*', requirePrincipal(resolver, deps.config.serviceKeys))
    guarded.route('/v1/auth', createAuth(deps))
    const response = await guarded.request(LOGIN, attempt(serviceOnly(), testConfig.adminPassword))
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ code: 'no_principal' })
  })
})
