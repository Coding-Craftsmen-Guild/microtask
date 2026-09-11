import { OpenAPIHono } from '@hono/zod-openapi'
import type { Role, Scope } from '@repo/kernel'
import { ShareIndex, type ProjectManifest, type ShareLink } from '@repo/microtask-domain'
import { MemoryProjectStore, fixedClock, manifest, sequentialIds, STAMP } from '@repo/microtask-domain/testing'
import { NodeFileSystem, QueueLock } from '@repo/store'
import { describe, expect, it } from 'vitest'
import { DOCS_PATH, DOC_PATH, createApp, docConfig } from './app.js'
import { AdminVerifier } from './auth/admin-verifier.js'
import type { ApiEnv } from './auth/env.js'
import { readConfig } from './config.js'
import type { ApiDeps } from './deps.js'
import { GLOBAL_BODY_LIMIT_BYTES } from './http/body-limits.js'
import { PROBLEM_MEDIA_TYPE } from './http/problem.js'
import { GUARDED_SECURITY, PRINCIPAL_TOKEN_SCHEME, SERVICE_KEY_SCHEME } from './http/security.js'
import { validationHook } from './http/validation-hook.js'
import { createProjectScoped } from './routes/microtask/project-scoped.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const P2 = '01M240ERCRWWCN16Q5AHP1FZAR'
const SAMPLE_ID = '01M240ERCRWWCN16Q5AHP1FZB1'
const SAMPLE_TOKEN = 'shr_sample_share_token'
const P1_VIEW = 'shr_p1_view_seat_token'
const KEY = 'k-microtask'
const GUARDED_PREFIX = '/v1/microtask'
const META_PATHS = [DOC_PATH, DOCS_PATH]

const config = readConfig({
  DATA_DIR: '/srv/data',
  ADMIN_PASSWORD: 'correct horse battery staple',
  SESSION_SECRET: 's'.repeat(32),
  SERVICE_KEYS: `microtask=${KEY}`,
})

const clock = fixedClock(STAMP)
const verifier = new AdminVerifier({ config, clock })

const link = (token: string, role: Role, scope: Scope): ShareLink => ({
  token,
  name: 'A seat',
  role,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

const buildDeps = async (): Promise<ApiDeps> => {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  const first: ProjectManifest = manifest(P1, {
    shareLinks: [link(P1_VIEW, 'view', { kind: 'project', projectId: P1 })],
  })
  const second: ProjectManifest = manifest(P2, { name: 'Other', shareLinks: [] })
  for (const project of [first, second]) {
    await store.saveManifest('microtask', project)
    tokens.add('microtask', project)
  }
  return {
    config,
    fileSystem: new NodeFileSystem(),
    store,
    lock: new QueueLock(),
    clock,
    ids: sequentialIds(),
    tokens,
  }
}

const buildApp = async (): Promise<OpenAPIHono<ApiEnv>> => createApp(await buildDeps())

const admin = (): Record<string, string> => ({
  'x-api-key': KEY,
  authorization: `Bearer ${verifier.issue().token}`,
})

const asLink = (token: string): Record<string, string> => ({
  'x-api-key': KEY,
  authorization: `Bearer ${token}`,
})

const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>

const toBraces = (path: string): string => path.replaceAll(/:([^/]+)/g, '{$1}')

const routerPaths = (app: OpenAPIHono<ApiEnv>): string[] =>
  [...new Set(app.routes.filter((one) => one.method !== 'ALL').map((one) => toBraces(one.path)))].sort()

const documentPaths = (app: OpenAPIHono<ApiEnv>): string[] =>
  Object.keys(app.getOpenAPI31Document(docConfig).paths ?? {}).sort()

const SAMPLES: Readonly<Record<string, string>> = {
  projectId: P1,
  folderId: SAMPLE_ID,
  taskId: SAMPLE_ID,
  tabId: SAMPLE_ID,
  token: SAMPLE_TOKEN,
}

const concrete = (path: string): string =>
  path.replaceAll(/\{([^}]+)\}/g, (_whole, name: string) => {
    const value = SAMPLES[name]
    if (value === undefined) throw new Error(`params.ts grew ${name}; give it a sample value here`)
    return value
  })

interface Call {
  readonly method: string
  readonly path: string
}

const guardedCalls = (app: OpenAPIHono<ApiEnv>): Call[] => {
  const paths = app.getOpenAPI31Document(docConfig).paths ?? {}
  return Object.entries(paths)
    .filter(([path]) => path.startsWith(GUARDED_PREFIX))
    .flatMap(([path, item]) =>
      Object.keys(item as Record<string, unknown>).map((method) => ({ method, path: concrete(path) })),
    )
}

const statuses = async (app: OpenAPIHono<ApiEnv>, calls: readonly Call[]): Promise<unknown[]> =>
  Promise.all(
    calls.map(async (call) => ({
      ...call,
      status: (await app.request(call.path, { method: call.method })).status,
    })),
  )

describe('proof (a): the live router and the emitted document describe the same tree', () => {
  it('serves every path it documents, and documents every path it serves but the two meta routes', async () => {
    const app = await buildApp()
    expect(routerPaths(app)).toEqual([...documentPaths(app), ...META_PATHS].sort())
  })

  it('documents the guarded subtree rather than only the root, so the comparison is not vacuous', async () => {
    const documented = documentPaths(await buildApp())
    expect(documented.filter((path) => path.startsWith(GUARDED_PREFIX)).length).toBeGreaterThan(0)
  })

  it('emits every path parameter in OpenAPI braces and routes it in hono colons', async () => {
    const app = await buildApp()
    expect(documentPaths(app)).toContain(`${GUARDED_PREFIX}/projects/{projectId}`)
    expect(app.routes.map((one) => one.path)).toContain(`${GUARDED_PREFIX}/projects/:projectId`)
  })

  it('leaves the document self-describing routes out of the document, and nothing else', async () => {
    const app = await buildApp()
    const undocumented = routerPaths(app).filter((path) => !documentPaths(app).includes(path))
    expect(undocumented.sort()).toEqual([...META_PATHS].sort())
  })
})

describe('proof (b): the guard covers the surface, not one route', () => {
  it('answers 401 to an uncredentialed request on every documented path under the guarded subtree', async () => {
    const app = await buildApp()
    const calls = guardedCalls(app)
    expect(calls.length).toBeGreaterThan(0)
    const answered = await statuses(app, calls)
    expect(answered.filter((one) => (one as { status: number }).status !== 401)).toEqual([])
  })

  it('would find a route mounted outside the guard, which is the failure it exists to catch', async () => {
    const deps = await buildDeps()
    const unguarded = new OpenAPIHono<ApiEnv>({ defaultHook: validationHook })
    const v1 = new OpenAPIHono<ApiEnv>()
    v1.route('/microtask/projects/:projectId', createProjectScoped(deps))
    unguarded.route('/v1', v1)
    const answered = await statuses(unguarded, guardedCalls(unguarded))
    expect(answered.filter((one) => (one as { status: number }).status !== 401).length).toBeGreaterThan(0)
  })

  it('refuses an unmatched path under the subtree before deciding it does not exist', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/nothing-here`)
    expect(response.status).toBe(401)
  })

  it('leaves everything outside the subtree reachable, so the check can tell the two apart', async () => {
    const response = await (await buildApp()).request('/healthz')
    expect(response.status).toBe(200)
  })
})

describe('the order the app is assembled in', () => {
  it('refuses an oversized body before the credential guard sees the request', async () => {
    const oversized = 'x'.repeat(GLOBAL_BODY_LIMIT_BYTES + 1)
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects`, {
      method: 'POST',
      body: oversized,
      headers: { 'content-length': String(oversized.length), 'content-type': 'application/json' },
    })
    expect(response.status).toBe(413)
  })

  it('refuses the same request with a small body at the guard instead', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-length': '2', 'content-type': 'application/json' },
    })
    expect(response.status).toBe(401)
  })

  it('reshapes a validation failure three levels down from the root that declared the hook', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects/not-a-ulid`, {
      headers: admin(),
    })
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
    expect(await body(response)).toMatchObject({ code: 'invalid', in: 'param' })
  })

  it('turns a domain error from a mounted handler into a problem document', async () => {
    const missing = '01M240ERCRWWCN16Q5AHP1FZZZ'
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects/${missing}`, {
      headers: admin(),
    })
    expect(response.status).toBe(404)
    expect(await body(response)).toMatchObject({ code: 'not_found' })
  })

  it('answers an unmatched path outside the subtree as a problem document', async () => {
    const response = await (await buildApp()).request('/no-such-thing')
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe(PROBLEM_MEDIA_TYPE)
  })
})

describe('the root routes', () => {
  it('reports health without a credential, because a probe has none', async () => {
    expect(await body(await (await buildApp()).request('/healthz'))).toEqual({ status: 'ok' })
  })

  it('serves the document, and the document describes this API', async () => {
    const document = await body(await (await buildApp()).request(DOC_PATH))
    expect(document['openapi']).toBe('3.1.0')
    expect((document['info'] as { title: string }).title).toBe(docConfig.info.title)
  })

  it('serves it in the 3.1 JSON Schema dialect, which the version field on its own does not establish', async () => {
    const served = await body(await (await buildApp()).request(DOC_PATH))
    const components = served['components'] as { schemas: Record<string, unknown> }
    const taskEntry = JSON.stringify(components.schemas['TaskEntry'])
    expect(taskEntry).toContain('"type":["string","null"]')
    expect(taskEntry).not.toContain('nullable')
  })

  it('serves the reference page as HTML', async () => {
    const response = await (await buildApp()).request(DOCS_PATH)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8')
  })
})

describe('what the document says about credentials', () => {
  it('declares both schemes the app accepts', async () => {
    const components = (await buildApp()).getOpenAPI31Document(docConfig).components ?? {}
    expect(Object.keys(components.securitySchemes ?? {}).sort()).toEqual(
      [PRINCIPAL_TOKEN_SCHEME, SERVICE_KEY_SCHEME].sort(),
    )
  })

  it('declares that requirement on every guarded operation, so a new route cannot quietly omit it', async () => {
    const paths = (await buildApp()).getOpenAPI31Document(docConfig).paths ?? {}
    const guarded = Object.entries(paths).filter(([path]) => path.startsWith(GUARDED_PREFIX))
    expect(guarded.length).toBeGreaterThan(0)
    const wanted = JSON.stringify(GUARDED_SECURITY)
    const missing = guarded.flatMap(([path, item]) =>
      Object.entries(item as Record<string, { security?: unknown }>)
        .filter(([, operation]) => JSON.stringify(operation.security) !== wanted)
        .map(([method]) => `${method} ${path}`),
    )
    expect(missing).toEqual([])
  })
})

describe('the gate inside the handlers, which the guard is not', () => {
  it('serves a project to the admin', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects/${P1}`, {
      headers: admin(),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).toMatchObject({ id: P1, name: 'Launch' })
  })

  it('serves that same project to a link scoped to it, without the share links it may not see', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects/${P1}`, {
      headers: asLink(P1_VIEW),
    })
    expect(response.status).toBe(200)
    expect(await body(response)).not.toHaveProperty('shareLinks')
  })

  it('refuses that link the other project with 403, which the guard alone would have answered 200', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects/${P2}`, {
      headers: asLink(P1_VIEW),
    })
    expect(response.status).toBe(403)
    expect(await body(response)).toMatchObject({ code: 'forbidden' })
  })

  it('lists every project for the admin', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects`, { headers: admin() })
    expect(response.status).toBe(200)
    const listed = (await body(response))['projects'] as { id: string }[]
    expect(listed.map((one) => one.id).sort()).toEqual([P1, P2].sort())
  })

  it('refuses the list to a link holder, because listing has no per-resource target', async () => {
    const response = await (await buildApp()).request(`${GUARDED_PREFIX}/projects`, {
      headers: asLink(P1_VIEW),
    })
    expect(response.status).toBe(403)
  })
})
