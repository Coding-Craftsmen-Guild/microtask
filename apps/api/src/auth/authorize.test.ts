import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { Action, Clock, Role, Scope, Target } from '@repo/kernel'
import { ShareIndex, type ProjectManifest, type ShareLink } from '@repo/microtask-domain'
import { MemoryProjectStore, manifest, STAMP } from '@repo/microtask-domain/testing'
import { describe, expect, it } from 'vitest'
import { errorHandler } from '../http/error-handler.js'
import { notFoundHandler } from '../http/not-found.js'
import { PROBLEM_MEDIA_TYPE } from '../http/problem.js'
import { validationHook } from '../http/validation-hook.js'
import { AdminVerifier } from './admin-verifier.js'
import { authorize } from './authorize.js'
import type { ApiEnv } from './env.js'
import { PrincipalResolver } from './principal-resolver.js'
import { requirePrincipal } from './require-principal.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAR'
const MY_TASK = '01M240ERCRWWCN16Q5AHP1FZB1'
const SIBLING_TASK = '01M240ERCRWWCN16Q5AHP1FZB2'

const P1_VIEW = 'shr_p1_view_seat_token'
const P1_MANAGE = 'shr_p1_manage_seat_tok'
const P1_TASK_VIEW = 'shr_p1_taskscoped_tok'
const KEY = 'k-microtask'
const SERVICE_KEYS = new Map([[KEY, 'microtask']])

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
  const first: ProjectManifest = manifest(P1, {
    shareLinks: [
      link(P1_VIEW, 'view', { kind: 'project', projectId: P1 }),
      link(P1_MANAGE, 'manage', { kind: 'project', projectId: P1 }),
      link(P1_TASK_VIEW, 'view', { kind: 'task', projectId: P1, taskId: MY_TASK }),
    ],
  })
  const second: ProjectManifest = manifest(P2, { shareLinks: [] })
  for (const project of [first, second]) {
    await store.saveManifest('microtask', project)
    tokens.add('microtask', project)
  }
  return new PrincipalResolver({ admin: verifier, tokens, store })
}

const projectRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}',
  request: { params: z.object({ projectId: z.string() }) },
  responses: { 200: { description: 'ok' } },
})

const taskRoute = createRoute({
  method: 'get',
  path: '/projects/{projectId}/tasks/{taskId}',
  request: { params: z.object({ projectId: z.string(), taskId: z.string() }) },
  responses: { 200: { description: 'ok' } },
})

type Gate = 'gated' | 'ungated'

const buildApp = async (gate: Gate, action: Action = 'project:read'): Promise<OpenAPIHono<ApiEnv>> => {
  const root = new OpenAPIHono<ApiEnv>({ defaultHook: validationHook })
  const guarded = new OpenAPIHono<ApiEnv>({ defaultHook: validationHook })
  guarded.use('*', requirePrincipal(await makeResolver(), SERVICE_KEYS))
  guarded.openapi(projectRoute, (c) => {
    const { projectId } = c.req.valid('param')
    c.header('etag', 'W/"a3f9c1"')
    const target: Target = { kind: 'project', projectId }
    const principal = gate === 'gated' ? authorize(c, action, target) : c.get('principal')
    return c.json({ projectId, kind: principal.kind }, 200)
  })
  guarded.openapi(taskRoute, (c) => {
    const { projectId, taskId } = c.req.valid('param')
    authorize(c, 'task:read', { kind: 'task', projectId, taskId })
    return c.json({ projectId, taskId }, 200)
  })
  root.route('/v1', guarded)
  root.onError(errorHandler)
  root.notFound(notFoundHandler)
  return root
}

const get = async (app: OpenAPIHono<ApiEnv>, path: string, bearer: string): Promise<Response> =>
  app.request(path, { headers: { 'x-api-key': KEY, authorization: `Bearer ${bearer}` } })

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

describe('fact 2: the credential guard authenticates, only the gate authorizes', () => {
  it('refuses a P1-scoped share token reading P2 with 403, because the handler calls authorize', async () => {
    const response = await get(await buildApp('gated'), `/v1/projects/${P2}`, P1_VIEW)
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ status: 403, code: 'forbidden' })
  })

  it('hands that same P1-scoped token P2 with 200 when the handler omits the gate', async () => {
    const response = await get(await buildApp('ungated'), `/v1/projects/${P2}`, P1_VIEW)
    expect(response.status).toBe(200)
    expect(await body(response)).toEqual({ projectId: P2, kind: 'link' })
  })

  it('lets the same token read its own project either way, so the 403 is about scope and not the token', async () => {
    expect((await get(await buildApp('gated'), `/v1/projects/${P1}`, P1_VIEW)).status).toBe(200)
    expect((await get(await buildApp('ungated'), `/v1/projects/${P1}`, P1_VIEW)).status).toBe(200)
  })
})

describe('authorize', () => {
  it('admits an admin to any project', async () => {
    const app = await buildApp('gated')
    const admin = verifier.issue().token
    expect((await get(app, `/v1/projects/${P1}`, admin)).status).toBe(200)
    expect((await get(app, `/v1/projects/${P2}`, admin)).status).toBe(200)
  })

  it('returns the principal, so a handler needs no second way to reach it', async () => {
    expect(await body(await get(await buildApp('gated'), `/v1/projects/${P1}`, P1_VIEW))).toEqual({
      projectId: P1,
      kind: 'link',
    })
  })

  it('refuses a view holder an action only write and manage carry', async () => {
    const app = await buildApp('gated', 'project:rename')
    expect((await get(app, `/v1/projects/${P1}`, P1_VIEW)).status).toBe(403)
    expect((await get(app, `/v1/projects/${P1}`, P1_MANAGE)).status).toBe(200)
  })

  it('refuses every link principal a top-level action, which is deny-by-default (ADR 0009)', async () => {
    const app = await buildApp('gated', 'workspace:list-projects')
    expect((await get(app, `/v1/projects/${P1}`, P1_VIEW)).status).toBe(403)
    expect((await get(app, `/v1/projects/${P1}`, P1_MANAGE)).status).toBe(403)
    expect((await get(app, `/v1/projects/${P1}`, verifier.issue().token)).status).toBe(200)
  })

  it('refuses a task-scoped holder a sibling task in the same project', async () => {
    const app = await buildApp('gated')
    expect((await get(app, `/v1/projects/${P1}/tasks/${MY_TASK}`, P1_TASK_VIEW)).status).toBe(200)
    expect((await get(app, `/v1/projects/${P1}/tasks/${SIBLING_TASK}`, P1_TASK_VIEW)).status).toBe(403)
  })

  it('builds its target from the validated params, so the path decides what is being asked about', async () => {
    const app = await buildApp('gated')
    expect((await get(app, `/v1/projects/${P1}/tasks/${MY_TASK}`, P1_VIEW)).status).toBe(200)
    expect((await get(app, `/v1/projects/${P2}/tasks/${MY_TASK}`, P1_VIEW)).status).toBe(403)
  })

  it('answers 403 as a problem document carrying no header the handler had already set', async () => {
    const response = await get(await buildApp('gated'), `/v1/projects/${P2}`, P1_VIEW)
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(response.headers.get('etag')).toBeNull()
    expect([...response.headers.keys()].sort()).toEqual(['cache-control', 'content-type'])
  })

  it('names the action it refused and never the target, so a 403 confirms nothing about the resource', async () => {
    const document = await body(await get(await buildApp('gated'), `/v1/projects/${P2}`, P1_VIEW))
    expect(document.detail).toContain('project:read')
    expect(document.detail).not.toContain(P2)
    expect(document.instance).toBe(`/v1/projects/${P2}`)
  })

  it('refuses a revoked token before the gate is even reached, because resolution comes first', async () => {
    const response = await get(await buildApp('gated'), `/v1/projects/${P1}`, 'shr_never_minted_tok')
    expect(response.status).toBe(401)
    expect(await body(response)).toMatchObject({ code: 'unknown_principal' })
  })
})
