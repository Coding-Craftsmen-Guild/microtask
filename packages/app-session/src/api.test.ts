import { ApiError, type ClientOptions } from '@repo/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { adminClientFor } from './api'

interface Sent {
  readonly url: string
  readonly init: RequestInit
}

const headerOf = (sent: Sent, name: string): string | undefined =>
  (sent.init.headers as Record<string, string> | undefined)?.[name]

const optionsAnswering = (sent: Sent[], response: () => Response): ClientOptions => ({
  baseUrl: 'http://api.internal:4321',
  serviceKey: 'the-service-key',
  fetch: (url, init) => {
    sent.push({ url, init })
    return Promise.resolve(response())
  },
})

const ok = (): Response =>
  new Response(JSON.stringify({ projects: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const refusal = (): Response =>
  new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      code: 'no_principal',
      detail: 'This request carried no bearer token.',
      instance: '/v1/microtask/projects',
    }),
    { status: 401, headers: { 'content-type': 'application/problem+json' } },
  )

describe('adminClientFor', () => {
  it('sends the service key and the bearer together, never the key alone', async () => {
    const sent: Sent[] = []
    const client = adminClientFor({ kind: 'admin', token: 'admin.99.sig' }, optionsAnswering(sent, ok))
    await client.projects.list()
    const only = sent[0]
    if (only === undefined) throw new Error('no request was sent')
    expect(headerOf(only, 'x-api-key')).toBe('the-service-key')
    expect(headerOf(only, 'authorization')).toBe('Bearer admin.99.sig')
  })

  it('brands the client admin, so it cannot stand in for a link client', () => {
    const client = adminClientFor({ kind: 'admin', token: 'a' }, optionsAnswering([], ok))
    expect(client.credential).toBe('admin')
  })

  it('lets a 401 reach the caller instead of papering over it', async () => {
    const client = adminClientFor({ kind: 'admin', token: 'a' }, optionsAnswering([], refusal))
    const failure = await client.projects.list().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(ApiError)
    expect(failure).toMatchObject({ status: 401, code: 'no_principal' })
  })
})

describe('apiOptions and loginWith read the environment and nothing else', () => {
  beforeEach(() => {
    vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
    vi.stubEnv('API_KEY', 'mp-service-key')
    vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('names the API and the calling product from API_BASE_URL and API_KEY', async () => {
    vi.resetModules()
    const { apiOptions } = await import('./api')
    expect(apiOptions()).toEqual({ baseUrl: 'http://api.internal:4321', serviceKey: 'mp-service-key' })
  })

  it('posts the password to the product-agnostic /v1/auth/login with the key and no bearer', async () => {
    const sent: Sent[] = []
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      sent.push({ url, init })
      return Promise.resolve(
        new Response(JSON.stringify({ token: 'admin.1.sig', expiresAt: '2026-09-22T12:00:00.000Z', expiresInSeconds: 600 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    })
    vi.resetModules()
    const { loginWith } = await import('./api')
    await loginWith('hunter2')
    const only = sent[0]
    if (only === undefined) throw new Error('no request was sent')
    expect(only.url).toBe('http://api.internal:4321/v1/auth/login')
    expect(headerOf(only, 'x-api-key')).toBe('mp-service-key')
    expect(headerOf(only, 'authorization')).toBeUndefined()
  })
})
