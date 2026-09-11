import { OpenAPIHono } from '@hono/zod-openapi'
import type { Clock, Role, Scope } from '@repo/kernel'
import { ShareIndex, type ProjectManifest, type ShareLink } from '@repo/microtask-domain'
import { MemoryProjectStore, manifest, STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { errorHandler } from '../http/error-handler.js'
import { notFoundHandler } from '../http/not-found.js'
import { PROBLEM_MEDIA_TYPE } from '../http/problem.js'
import { AdminVerifier } from './admin-verifier.js'
import type { ApiEnv } from './env.js'
import { PrincipalResolver } from './principal-resolver.js'
import { requirePrincipal } from './require-principal.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TOKEN = 'shr_p1_view_seat_token'
const KEY = 'k-microtask'
const SERVICE_KEYS = new Map([
  [KEY, 'microtask'],
  ['k-macroplan', 'macroplan'],
])

const clock: Clock = { now: () => STAMP }

const link = (token: string, role: Role, scope: Scope): ShareLink => ({
  token,
  name: 'A seat',
  role,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

const verifier = new AdminVerifier({
  config: {
    sessionSecret: 'session-secret-of-at-least-32-chars!',
    adminTokenTtlSeconds: 3600,
    adminPassword: 'correct horse battery staple',
  },
  clock,
})

const makeResolver = async (): Promise<PrincipalResolver> => {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  const project: ProjectManifest = manifest(P1, {
    shareLinks: [link(TOKEN, 'view', { kind: 'project', projectId: P1 })],
  })
  await store.saveManifest('microtask', project)
  tokens.add('microtask', project)
  return new PrincipalResolver({ admin: verifier, tokens, store })
}

type Order = 'guard-first' | 'guard-after-the-route'

const buildApp = async (order: Order = 'guard-first'): Promise<OpenAPIHono<ApiEnv>> => {
  const resolver = await makeResolver()
  const guard = requirePrincipal(resolver, SERVICE_KEYS)
  const root = new OpenAPIHono<ApiEnv>()
  const guarded = new OpenAPIHono<ApiEnv>()
  if (order === 'guard-first') guarded.use('*', guard)
  guarded.get('/projects/:projectId', (c) => {
    c.header('etag', 'W/"a3f9c1"')
    return c.json({
      projectId: c.req.param('projectId'),
      principal: c.get('principal'),
      service: c.get('service'),
    })
  })
  if (order === 'guard-after-the-route') guarded.use('*', guard)
  root.route('/v1', guarded)
  root.onError(errorHandler)
  root.notFound(notFoundHandler)
  return root
}

const headers = (given: { key?: string; bearer?: string }): Record<string, string> => {
  const out: Record<string, string> = {}
  if (given.key !== undefined) out['x-api-key'] = given.key
  if (given.bearer !== undefined) out.authorization = given.bearer
  return out
}

const call = async (
  given: { key?: string; bearer?: string },
  path = `/v1/projects/${P1}`,
): Promise<Response> => (await buildApp()).request(path, { headers: headers(given) })

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('the credential matrix (ADR 0012)', () => {
  it('refuses a bare request with 401 unknown_service, because no app has identified itself', async () => {
    const response = await call({})
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ status: 401, code: 'unknown_service' })
  })

  it('refuses a service key on its own with 401 no_principal, which is the confused deputy this closes', async () => {
    const response = await call({ key: KEY })
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ status: 401, code: 'no_principal' })
  })

  it('refuses a bearer token on its own with 401 unknown_service', async () => {
    const response = await call({ bearer: `Bearer ${TOKEN}` })
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ status: 401, code: 'unknown_service' })
  })

  it('admits a request carrying both credentials', async () => {
    const response = await call({ key: KEY, bearer: `Bearer ${TOKEN}` })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({
      projectId: P1,
      principal: { kind: 'link', role: 'view', token: TOKEN },
      service: 'microtask',
    })
  })

  it('refuses an unmatched path under the guarded subtree with 401 before 404, so a token cannot map the API', async () => {
    const response = await call({}, '/v1/projects/01M240ERCRWWCN16Q5AHP1FZAR/secret-thing')
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ code: 'unknown_service' })
  })

  it('answers 404 for that same unmatched path once both credentials are present', async () => {
    const response = await call(
      { key: KEY, bearer: `Bearer ${TOKEN}` },
      '/v1/projects/01M240ERCRWWCN16Q5AHP1FZAR/secret-thing',
    )
    expect(response.status).toBe(404)
  })
})

describe('requirePrincipal', () => {
  it('refuses a service key no configuration names', async () => {
    expect(await body(await call({ key: 'k-forged', bearer: `Bearer ${TOKEN}` }))).toMatchObject({
      code: 'unknown_service',
    })
  })

  it('names the calling app from its key, so a handler knows which app it is serving', async () => {
    const response = await call({ key: 'k-macroplan', bearer: `Bearer ${TOKEN}` })
    expect(await body(response)).toMatchObject({ service: 'macroplan' })
  })

  it('refuses a bearer token that resolves to nothing, distinctly from one that was never sent', async () => {
    expect(await body(await call({ key: KEY, bearer: 'Bearer shr_never_minted_tok' }))).toMatchObject({
      code: 'unknown_principal',
    })
  })

  it('resolves an admin token to the admin principal', async () => {
    const response = await call({ key: KEY, bearer: `Bearer ${verifier.issue().token}` })
    expect(await body(response)).toMatchObject({ principal: { kind: 'admin' } })
  })

  it('accepts the scheme case-insensitively, as RFC 7235 requires', async () => {
    expect((await call({ key: KEY, bearer: `bEaReR ${TOKEN}` })).status).toBe(200)
  })

  const rejected = [
    ['an Authorization header with no scheme', TOKEN],
    ['a Basic credential', 'Basic YWRtaW46c2VjcmV0'],
    ['the word Bearer with no token', 'Bearer'],
    ['Bearer followed by whitespace only', 'Bearer    '],
    ['an empty Authorization header', ''],
    ['a scheme run into its token with no space', `Bearer${TOKEN}`],
    ['the scheme name with one trailing character and no space', 'Bearerx'],
  ] as const

  for (const [label, header] of rejected) {
    it(`refuses ${label} with no_principal`, async () => {
      const response = await call({ key: KEY, bearer: header })
      expect(response.status).toBe(401)
      expect(await body(response)).toMatchObject({ code: 'no_principal' })
    })
  }

  it('refuses a token that is only a non-breaking space, which HTTP trimming leaves in place', async () => {
    const nonBreaking = String.fromCharCode(0xa0)
    const response = await call({ key: KEY, bearer: `Bearer ${nonBreaking}` })
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ code: 'no_principal' })
  })

  it('answers 401 as a problem document rather than a bare status', async () => {
    const response = await call({})
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(await body(response)).toMatchObject({ type: '/problems/unknown_service', title: 'Unauthorized' })
  })

  it('never reveals which credential was wrong beyond the code, and never echoes either one back', async () => {
    const document = JSON.stringify(await body(await call({ key: 'k-forged', bearer: `Bearer ${TOKEN}` })))
    expect(document).not.toContain('k-forged')
    expect(document).not.toContain(TOKEN)
  })

  it('carries no header the refused handler would have set, because the handler never ran', async () => {
    const response = await call({})
    expect(response.headers.get('etag')).toBeNull()
    expect([...response.headers.keys()].sort()).toEqual(['cache-control', 'content-type'])
  })
})

describe('fact 1: a guard registered after the route it should protect never runs', () => {
  it('answers 200 with no credentials at all when the use() comes after the get()', async () => {
    const unguarded = await buildApp('guard-after-the-route')
    const response = await unguarded.request(`/v1/projects/${P1}`)
    expect(response.status).toBe(200)
  })

  it('answers 401 for the same request when the use() comes first', async () => {
    const guarded = await buildApp('guard-first')
    expect((await guarded.request(`/v1/projects/${P1}`)).status).toBe(401)
  })
})
