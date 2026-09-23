import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { docConfig } from './http/docs.js'
import { GUARDED_PREFIX, IDS, SERVICE_KEY, TOKENS, admin, body, buildApp } from './testing/harness.js'
import { MACROPLAN_PREFIX, PLAN_IDS } from './testing/macroplan-harness.js'

const SAMPLES: Readonly<Record<string, string>> = {
  projectId: IDS.p1,
  folderId: IDS.f1,
  taskId: IDS.t1,
  tabId: IDS.tab1,
  token: TOKENS.p1View,
  sessionId: IDS.missing,
  planId: PLAN_IDS.plan,
  epicId: PLAN_IDS.e1,
  featureId: PLAN_IDS.f1,
  itemId: PLAN_IDS.i1,
}

/**
 * Every prefix a product mounts its guarded routes under.
 *
 * Both are listed rather than one, because the matrix below is the only place that asks each group
 * what it does with a missing credential, and a product left out of this array would be left out of
 * that question — silently, since nothing else here enumerates products. `/v1/auth` and `/healthz`
 * are deliberately absent: the first mints a principal and the second carries none.
 */
const GUARDED_PREFIXES: readonly string[] = [GUARDED_PREFIX, MACROPLAN_PREFIX]

const isGuarded = (path: string): boolean =>
  GUARDED_PREFIXES.some((prefix) => path.startsWith(prefix))

const concrete = (path: string): string =>
  path.replaceAll(/\{([^}]+)\}/g, (_whole, name: string) => {
    const value = SAMPLES[name]
    if (value === undefined) throw new Error(`params.ts grew ${name}; give it a sample value here`)
    return value
  })

interface Call {
  readonly group: string
  readonly method: string
  readonly path: string
}

const everyCall = async (): Promise<Call[]> => {
  const paths = (await buildApp()).getOpenAPI31Document(docConfig).paths ?? {}
  return Object.entries(paths).flatMap(([path, item]) =>
    Object.entries(item as Record<string, { tags?: string[] }>).map(([method, operation]) => ({
      group: operation.tags?.[0] ?? 'untagged',
      method: method.toUpperCase(),
      path: concrete(path),
    })),
  )
}

const oneCallPerGroup = async (): Promise<Call[]> => {
  const seen = new Map<string, Call>()
  for (const call of await everyCall()) if (!seen.has(call.group)) seen.set(call.group, call)
  return [...seen.values()]
}

const guarded = async (): Promise<Call[]> =>
  (await oneCallPerGroup()).filter((call) => isGuarded(call.path))

const send = async (call: Call, headers: Record<string, string>): Promise<Response> => {
  const app = await buildApp()
  if (call.method === 'GET' || call.method === 'HEAD') {
    return app.request(call.path, { method: call.method, headers })
  }
  return app.request(call.path, { method: call.method, headers, body: '{}' })
}

const codeOf = async (response: Response): Promise<unknown> => (await body(response))['code']

const refusal = async (call: Call, headers: Record<string, string>): Promise<unknown[]> => {
  const response = await send(call, headers)
  return [call.group, response.status, await codeOf(response)]
}

const ADMIN_BEARER = (): Record<string, string> => {
  const both = admin()
  return { authorization: both['authorization'] ?? '' }
}

const BOGUS = { 'x-api-key': SERVICE_KEY, authorization: 'Bearer shr_names_nobody_at_all' }

describe('guard (2): the credential matrix, per route group', () => {
  it('covers every group the document declares, so a new resource cannot skip the matrix', async () => {
    const groups = (await oneCallPerGroup()).map((call) => call.group).sort()
    expect(groups).toEqual([
      'auth',
      'epics',
      'export',
      'features',
      'folders',
      'import',
      'items',
      'meta',
      'plans',
      'projects',
      'search',
      'share-links',
      'shares',
      'tabs',
      'tasks',
    ])
  })

  it('refuses a bare request on every guarded group, naming the service and not the principal', async () => {
    const calls = await guarded()
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(await refusal(call, {})).toEqual([call.group, 401, 'unknown_service'])
    }
  })

  it('refuses a service key carrying no principal on every guarded group', async () => {
    for (const call of await guarded()) {
      const headers = { 'x-api-key': SERVICE_KEY }
      expect(await refusal(call, headers)).toEqual([call.group, 401, 'no_principal'])
    }
  })

  it('refuses a bearer token with no service key on every guarded group', async () => {
    for (const call of await guarded()) {
      expect(await refusal(call, ADMIN_BEARER())).toEqual([call.group, 401, 'unknown_service'])
    }
  })

  it('refuses a bearer token that names nobody on every guarded group', async () => {
    for (const call of await guarded()) {
      expect(await refusal(call, BOGUS)).toEqual([call.group, 401, 'unknown_principal'])
    }
  })

  it('lets both credentials past the guard on every guarded group, so the refusals mean something', async () => {
    for (const call of await guarded()) {
      const response = await send(call, { ...admin(), 'content-type': 'application/json' })
      expect([call.group, response.status === 401]).toEqual([call.group, false])
    }
  })

  it('demands a service key on the login group, and no principal at all', async () => {
    const [login] = (await oneCallPerGroup()).filter((call) => call.group === 'auth')
    expect(login).toBeDefined()
    const headers = { 'x-api-key': SERVICE_KEY, 'content-type': 'application/json' }
    expect((await send(login ?? { group: '', method: 'POST', path: '/' }, {})).status).toBe(401)
    const app = await buildApp()
    const keyed = await app.request(login?.path ?? '/', {
      method: 'POST',
      headers,
      body: JSON.stringify({ password: 'correct horse battery staple' }),
    })
    expect(keyed.status).toBe(200)
  })

  it('serves the meta group with no credential at all, because a probe carries none', async () => {
    const [meta] = (await oneCallPerGroup()).filter((call) => call.group === 'meta')
    expect(meta).toBeDefined()
    expect((await send(meta ?? { group: '', method: 'GET', path: '/healthz' }, {})).status).toBe(200)
  })
})

const under = async (directory: string): Promise<string[]> => {
  const root = fileURLToPath(new URL(directory, import.meta.url))
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries
    .filter((one) => one.isFile() && one.name.endsWith('.ts') && !one.name.endsWith('.test.ts'))
    .map((one) => join(one.parentPath, one.name))
}

const withoutComments = (text: string): string => text.replaceAll(/\/\*[\s\S]*?\*\//g, '')

const GATE = (): RegExp => /(?<![\w$])authorize\(/g
const POLICY = (): RegExp => /(?<![\w$])can\(/g

const countIn = (text: string, pattern: RegExp): number =>
  (withoutComments(text).match(pattern) ?? []).length

const matchesIn = async (files: readonly string[], pattern: RegExp): Promise<number> => {
  const texts = await Promise.all(files.map((file) => readFile(file, 'utf8')))
  return texts.reduce((total, text) => total + countIn(text, pattern), 0)
}

const handlerCount = async (): Promise<number> =>
  (await everyCall()).filter((call) => isGuarded(call.path)).length

/**
 * Gates beyond one per guarded operation, counted rather than allowed for.
 *
 * Three `PATCH` routes carry two authorities in one body, and each costs **two** extra textual
 * `authorize(` calls: the branch that asks a single action, and the second gate a body doing both
 * runs into. `PATCH /v1/macroplan/plans/{planId}` is one — a `name` needs `plan:rename` and a
 * calendar field needs `plan:retime`. The other two are `PATCH .../features/{featureId}`, where a
 * `name` needs `feature:rename` and an `estimateDays` or `pinSprint` needs `feature:estimate`, and
 * `PATCH .../items/{itemId}`, where a `name` needs `item:rename` and an `estimateDays` needs
 * `item:estimate`. Each handler asks for each action the body's present keys imply and never for one
 * the body omitted, which is what makes three routes cost six.
 *
 * Counted here rather than turned into a `>=`, because the equality is the whole guard: a handler
 * that forgot its gate makes the total fall **short** of this sum, and a `>=` would let one
 * handler's second gate pay for another handler's missing first.
 */
const EXTRA_GATES = 6

describe('guard (3): one authorize( per handler, and one can() in the app', () => {
  it('counts one authorize( per guarded operation, plus the six two-authority bodies add', async () => {
    expect(await matchesIn(await under('./routes/'), GATE())).toBe(
      (await handlerCount()) + EXTRA_GATES,
    )
  })

  it('finds handlers to count, so that equality is not two zeroes agreeing', async () => {
    expect(await handlerCount()).toBeGreaterThan(20)
  })

  it('asks the policy in exactly one place, which is what makes a missing gate greppable', async () => {
    const files = await under('./')
    const texts = await Promise.all(
      files.map(async (file) => ({ file, text: await readFile(file, 'utf8') })),
    )
    const callers = texts
      .filter((one) => countIn(one.text, POLICY()) > 0)
      .map((one) => one.file.replaceAll('\\', '/').split('/src/')[1])
    expect(callers).toEqual(['auth/authorize.ts'])
    expect(await matchesIn(files, POLICY())).toBe(1)
  })

  it('builds no error response with c.json, so nothing a handler set can ride along on one', async () => {
    const texts = await Promise.all((await under('./')).map((file) => readFile(file, 'utf8')))
    const statuses = texts.flatMap((text) =>
      [...withoutComments(text).matchAll(/c\.json\(.*?,\s*(\d{3})\)/g)].map((found) => found[1] ?? ''),
    )
    expect(statuses.filter((status) => !status.startsWith('2'))).toEqual([])
    expect(statuses.length).toBeGreaterThan(20)
  })

  it('keeps the login handler out of src/routes, because it has no principal to gate', async () => {
    const source = fileURLToPath(new URL('./auth/login.ts', import.meta.url))
    const login = await readFile(source, 'utf8')
    expect(login).toContain('no principal to gate')
    expect(countIn(login, GATE())).toBe(0)
    const routes = await under('./routes/')
    expect(routes.some((file) => file.endsWith('login.ts'))).toBe(false)
    expect((await everyCall()).some((call) => call.path === '/v1/auth/login')).toBe(true)
  })
})
