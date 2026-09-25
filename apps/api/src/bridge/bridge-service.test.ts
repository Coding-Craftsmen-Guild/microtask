import { seal, ShareIndex, type Principal, type Role } from '@repo/kernel'
import type { EpicBinding, PlanEpic } from '@repo/macroplan-domain'
import { epic, planManifest } from '@repo/macroplan-domain/testing'
import { TaskService, type ProjectManifest, type ProjectStore } from '@repo/microtask-domain'
import { describe, expect, it } from 'vitest'
import { AdminVerifier } from '../auth/admin-verifier.js'
import { linkDirectories } from '../auth/link-directory.js'
import { PrincipalResolver } from '../auth/principal-resolver.js'
import type { ApiDeps } from '../deps.js'
import { IDS, PLAN_TOKEN, TOKENS, buildDeps, testConfig } from '../testing/harness.js'
import { BridgeService, type Bearers, type BoundProject } from './bridge-service.js'

const SECRET = 'a-bridge-secret-of-at-least-32-by'
const OTHER_SECRET = 'a-different-secret-at-least-32-by'
const RAIL = '01M240ERCRWWCN16Q5AHP1FZE1'
const RAIL_TWO = '01M240ERCRWWCN16Q5AHP1FZE2'

// A ProjectStore that says how many times it was asked for a manifest, so the deduplication claim
// is measured rather than assumed. It delegates rather than reimplements: the fixture's own store is
// what holds the two projects, and a hand-written double would drift from it.
//
// Every method is forwarded by hand, and `{ ...inner }` would NOT do it: MemoryProjectStore's
// methods live on its prototype, and a spread copies own enumerable properties only — so the double
// came out missing saveTask and the first createTask test failed inside TaskService rather than in
// anything this file is about. Listing all eight also means a method added to the port fails to
// compile here instead of silently arriving unforwarded.
const delegating = (inner: ProjectStore, over: Partial<ProjectStore> = {}): ProjectStore => ({
  listManifests: (product) => inner.listManifests(product),
  readManifest: (product, projectId) => inner.readManifest(product, projectId),
  readTask: (product, projectId, taskId) => inner.readTask(product, projectId, taskId),
  saveManifest: (product, manifest) => inner.saveManifest(product, manifest),
  saveTask: (product, manifest, task) => inner.saveTask(product, manifest, task),
  deleteTask: (product, manifest, taskId) => inner.deleteTask(product, manifest, taskId),
  publishProject: (product, project) => inner.publishProject(product, project),
  deleteProject: (product, projectId) => inner.deleteProject(product, projectId),
  ...over,
})

const counting = (
  inner: ProjectStore,
): { readonly store: ProjectStore; readonly reads: () => number } => {
  let reads = 0
  const store = delegating(inner, {
    readManifest: async (product, projectId) => {
      reads += 1
      return inner.readManifest(product, projectId)
    },
  })
  return { store, reads: () => reads }
}

interface Fixture {
  readonly deps: ApiDeps
  readonly bridge: BridgeService
  readonly reads: () => number
}

const build = async (secret = SECRET): Promise<Fixture> => {
  const deps = await buildDeps()
  const { store, reads } = counting(deps.store)
  const bearers = new PrincipalResolver({
    admin: new AdminVerifier({ config: testConfig, clock: deps.clock }),
    tokens: deps.tokens,
    directories: linkDirectories(store, deps.plans),
  })
  const tasks = new TaskService({ ...deps, store })
  return { deps, reads, bridge: new BridgeService({ secret, bearers, store, tasks }) }
}

const binding = (token: string, role: EpicBinding['role'], projectId: string = IDS.p1): EpicBinding => ({
  projectId,
  role,
  sealedToken: seal(SECRET, token),
})

const railWith = (one: EpicBinding | null, id = RAIL): PlanEpic => epic(id, { binding: one })

const answerFor = async (fixture: Fixture, one: EpicBinding | null): Promise<BoundProject> => {
  const answers = await fixture.bridge.read([railWith(one)])
  const found = answers.get(RAIL)
  if (found === undefined) throw new Error('the map is meant to be total')
  return found
}

const stateOf = async (one: EpicBinding | null, secret = SECRET): Promise<string> =>
  (await answerFor(await build(secret), one)).state

describe('read answers unlinked for every way a binding can fail, and throws for none', () => {
  it('answers unlinked for a rail bound to nothing', async () => {
    expect(await stateOf(null)).toBe('unlinked')
  })

  it('answers unlinked for a blob that will not open under this secret', async () => {
    expect(await stateOf(binding(TOKENS.p1Manage, 'manage'), OTHER_SECRET)).toBe('unlinked')
  })

  it('answers unlinked for a token that opens and names nobody, which is a revoked seat', async () => {
    expect(await stateOf(binding('shr_revoked_seat_token_x', 'manage'))).toBe('unlinked')
  })

  // The whole of "a revoked token renders unlinked" (design §7.2). Revocation here is a real one:
  // the seat is dropped from the project's manifest, which is where PrincipalResolver reads a
  // link's live role on every call, so nothing is stubbed and no cache has to expire.
  it('answers unlinked once the seat is revoked out of the project it named', async () => {
    const fixture = await build()
    const bound = binding(TOKENS.p1Manage, 'manage')
    expect((await answerFor(fixture, bound)).state).toBe('bound')
    const project = await fixture.deps.store.readManifest('microtask', IDS.p1)
    const survivors = (project as ProjectManifest).shareLinks.filter(
      (each) => each.token !== TOKENS.p1Manage,
    )
    await fixture.deps.store.saveManifest('microtask', { ...(project as ProjectManifest), shareLinks: survivors })
    expect((await answerFor(fixture, bound)).state).toBe('unlinked')
  })

  it('answers unlinked once the bound project is gone, its manifest reading as absent', async () => {
    const fixture = await build()
    const bound = binding(TOKENS.p2Manage, 'manage', IDS.p2)
    expect((await answerFor(fixture, bound)).state).toBe('bound')
    const gone = delegating(fixture.deps.store, { readManifest: async () => null })
    const bridge = new BridgeService({
      secret: SECRET,
      bearers: { resolve: async () => ({ kind: 'link', role: 'manage', scope: { kind: 'project', projectId: IDS.p2 }, token: TOKENS.p2Manage }) },
      store: gone,
      tasks: new TaskService({ ...fixture.deps, store: gone }),
    })
    expect((await bridge.read([railWith(bound)])).get(RAIL)?.state).toBe('unlinked')
  })

  it('answers unlinked for a token whose scope names a different project than the binding stored', async () => {
    expect(await stateOf(binding(TOKENS.p2Manage, 'manage', IDS.p1))).toBe('unlinked')
  })

  // §7.2 binds an epic to a project: "a project-scoped token is one token per epic rather than one
  // per item". A task-scoped token would bind a rail to one task's worth of a project, and can()
  // clears it for project:read (TASK_SCOPE_PROJECT_ACTIONS), so the scope check is the only thing
  // that refuses it.
  it('answers unlinked for a task-scoped token, which the policy would clear for project:read', async () => {
    expect(await stateOf(binding(TOKENS.t1Manage, 'manage'))).toBe('unlinked')
  })

  it('answers unlinked for a plan token, a plan scope naming no project at all', async () => {
    const fixture = await build()
    await fixture.deps.plans.saveManifest('macroplan', planManifest(IDS.plan1))
    fixture.deps.tokens.add({ product: 'macroplan', containerId: IDS.plan1 }, [PLAN_TOKEN])
    expect((await answerFor(fixture, binding(PLAN_TOKEN, 'manage'))).state).toBe('unlinked')
  })

  // §7.2 opens by ruling this out: "Not an admin credential… the bridge must not rest on that
  // hole." resolve() answers admin for an admin bearer and can() clears an admin on everything, so
  // without this refusal a pasted admin token would confer every action on every project.
  it('answers unlinked for an admin bearer, which can() would otherwise clear for everything', async () => {
    const fixture = await build()
    const token = new AdminVerifier({ config: testConfig, clock: fixture.deps.clock }).issue().token
    expect((await answerFor(fixture, binding(token, 'manage'))).state).toBe('unlinked')
  })
})

describe('read answers the bound project, its role already attenuated once (design §7.3)', () => {
  const roleOf = async (declared: EpicBinding['role'], token: string): Promise<Role | undefined> => {
    const found = await answerFor(await build(), binding(token, declared))
    return found.state === 'bound' ? found.role : undefined
  }

  it('is not vacuous: a manage declaration over a manage token is bound at manage', async () => {
    expect(await roleOf('manage', TOKENS.p1Manage)).toBe('manage')
  })

  it('lowers a manage declaration to what the token actually holds today', async () => {
    expect(await roleOf('manage', TOKENS.p1View)).toBe('view')
    expect(await roleOf('manage', TOKENS.p1Write)).toBe('write')
  })

  it('lowers a strong token to the role the admin declared, the declaration being the ceiling', async () => {
    expect(await roleOf('view', TOKENS.p1Manage)).toBe('view')
  })

  it('carries every task of the bound project, by id, with its name and its counted progress', async () => {
    const found = await answerFor(await build(), binding(TOKENS.p1View, 'view'))
    if (found.state !== 'bound') throw new Error('expected bound')
    expect(found.projectId).toBe(IDS.p1)
    expect(found.tasks.get(IDS.t1)?.name).toBe('Write the spec')
    expect(found.tasks.get(IDS.t1)?.progress).toEqual({ done: 0, total: 0 })
    expect([...found.tasks.keys()].sort()).toEqual([IDS.t1, IDS.t2, IDS.t3, IDS.t4].sort())
  })

  it('carries only the name and the count, so no other field of a task entry reaches a plan', async () => {
    const found = await answerFor(await build(), binding(TOKENS.p1View, 'view'))
    if (found.state !== 'bound') throw new Error('expected bound')
    expect(Object.keys(found.tasks.get(IDS.t1) ?? {}).sort()).toEqual(['name', 'progress'])
  })
})

describe('read is total, and reads one manifest per distinct token rather than per rail', () => {
  it('answers one entry per rail it was given, and no more', async () => {
    const fixture = await build()
    const answers = await fixture.bridge.read([
      railWith(binding(TOKENS.p1Manage, 'manage')),
      railWith(null, RAIL_TWO),
    ])
    expect([...answers.keys()].sort()).toEqual([RAIL, RAIL_TWO].sort())
  })

  it('answers an empty map for no rails at all, rather than refusing', async () => {
    expect((await (await build()).bridge.read([])).size).toBe(0)
  })

  // LIMITS.epicsPerPlan is 40, so an undeduplicated read of a fully bound plan would be forty
  // resolves and forty manifest reads on one request.
  it('reads the manifest once for two rails bound to one project through one token', async () => {
    const fixture = await build()
    const before = fixture.reads()
    const answers = await fixture.bridge.read([
      railWith(binding(TOKENS.p1Manage, 'manage')),
      railWith(binding(TOKENS.p1Manage, 'manage'), RAIL_TWO),
    ])
    expect(answers.get(RAIL)?.state).toBe('bound')
    expect(answers.get(RAIL_TWO)?.state).toBe('bound')
    // One for the bridge's own read; the resolver reads the manifest too, once per distinct token.
    expect(fixture.reads() - before).toBe(2)
  })

  // seal() takes a fresh IV per call, so the same token sealed twice is two different blobs:
  // deduplicating on the stored value would never find a match, which is why the key is the opened
  // token. Two blobs of one token must still cost one read.
  it('deduplicates on the opened token, two seals of one token being two different blobs', async () => {
    const fixture = await build()
    const one = binding(TOKENS.p1Manage, 'manage')
    const two = binding(TOKENS.p1Manage, 'manage')
    expect(one.sealedToken).not.toBe(two.sealedToken)
    const before = fixture.reads()
    await fixture.bridge.read([railWith(one), railWith(two, RAIL_TWO)])
    expect(fixture.reads() - before).toBe(2)
  })

  it('reads twice for two rails bound to two different projects, so the sweep is not vacuous', async () => {
    const fixture = await build()
    const before = fixture.reads()
    await fixture.bridge.read([
      railWith(binding(TOKENS.p1Manage, 'manage')),
      railWith(binding(TOKENS.p2Manage, 'manage', IDS.p2), RAIL_TWO),
    ])
    expect(fixture.reads() - before).toBe(4)
  })
})

describe('createTask is the one write, and it needs manage on both halves of the binding', () => {
  const tasksIn = async (fixture: Fixture, projectId = IDS.p1): Promise<number> =>
    (await fixture.deps.store.readManifest('microtask', projectId))?.tasks.length ?? 0

  it('creates the task in the bound project and answers its id', async () => {
    const fixture = await build()
    const before = await tasksIn(fixture)
    const id = await fixture.bridge.createTask(binding(TOKENS.p1Manage, 'manage'), 'Rotate the keys')
    expect(id).not.toBeNull()
    expect(await tasksIn(fixture)).toBe(before + 1)
    const project = await fixture.deps.store.readManifest('microtask', IDS.p1)
    expect(project?.tasks.find((each) => each.id === id)?.name).toBe('Rotate the keys')
  })

  it('refuses a rail the admin bound at view, however strong its token is, and writes nothing', async () => {
    const fixture = await build()
    const before = await tasksIn(fixture)
    expect(await fixture.bridge.createTask(binding(TOKENS.p1Manage, 'view'), 'Rotate the keys')).toBeNull()
    expect(await tasksIn(fixture)).toBe(before)
  })

  it.each([TOKENS.p1View, TOKENS.p1Write])(
    'refuses a manage declaration whose token holds only %s today, and writes nothing',
    async (token) => {
      const fixture = await build()
      const before = await tasksIn(fixture)
      expect(await fixture.bridge.createTask(binding(token, 'manage'), 'Rotate the keys')).toBeNull()
      expect(await tasksIn(fixture)).toBe(before)
    },
  )

  it('refuses a revoked token, a blob that will not open, and a task-scoped token alike', async () => {
    const fixture = await build()
    const cases = [
      binding('shr_revoked_seat_token_x', 'manage'),
      { ...binding(TOKENS.p1Manage, 'manage'), sealedToken: seal(OTHER_SECRET, TOKENS.p1Manage) },
      binding(TOKENS.t1Manage, 'manage'),
    ]
    for (const one of cases) {
      expect(await fixture.bridge.createTask(one, 'Rotate the keys')).toBeNull()
    }
    expect(await tasksIn(fixture)).toBe(4)
  })

  it('refuses an admin bearer here too, not only on the read path', async () => {
    const fixture = await build()
    const token = new AdminVerifier({ config: testConfig, clock: fixture.deps.clock }).issue().token
    expect(await fixture.bridge.createTask(binding(token, 'manage'), 'Rotate the keys')).toBeNull()
  })

  // The cap is not an unlinked rail and must not be swallowed into one: TaskService.create throws
  // through assertWithin, and a bound project at its cap is a real conflict the route answers for.
  it('lets the project’s own task cap throw rather than reporting the rail unlinked', async () => {
    const fixture = await build()
    const project = await fixture.deps.store.readManifest('microtask', IDS.p1)
    const full = Array.from({ length: 500 }, (_unused, index) => ({
      ...(project as ProjectManifest).tasks[0],
      id: `01M240ERCRWWCN16Q5AHP1F${String(index).padStart(3, '0')}`,
    }))
    await fixture.deps.store.saveManifest('microtask', {
      ...(project as ProjectManifest),
      tasks: full as ProjectManifest['tasks'],
    })
    await expect(
      fixture.bridge.createTask(binding(TOKENS.p1Manage, 'manage'), 'One too many'),
    ).rejects.toThrow(/tasksPerProject|cap|limit/iu)
  })
})

describe('the bridge has exactly one reader and one writer (design §7.2)', () => {
  // §7.2 bounds a manage binding by promising the write path "permits exactly one operation —
  // create a task in the bound project. No delete, no rename of anything Macroplan did not create,
  // no share-link management." This is that promise made mechanical: a third method here fails this
  // test, in the commit that adds it, and somebody has to record the decision instead.
  it('exposes read and createTask and nothing else at all', async () => {
    const { bridge } = await build()
    const named = Object.getOwnPropertyNames(Object.getPrototypeOf(bridge) as object)
      .filter((name) => name !== 'constructor')
      .sort()
    expect(named).toEqual(['createTask', 'read'])
  })

  it('is not vacuous: both of the two are callable functions on the instance', async () => {
    const { bridge } = await build()
    expect(typeof bridge.read).toBe('function')
    expect(typeof bridge.createTask).toBe('function')
  })

  it('takes its bearers as a one-method port, so nothing here can reach the rest of a resolver', () => {
    const only: Bearers = { resolve: async (): Promise<Principal | null> => null }
    expect(Object.keys(only)).toEqual(['resolve'])
  })

  it('keeps one index per fixture, so a token warmed in one suite cannot resolve in another', async () => {
    expect((await build()).deps.tokens).toBeInstanceOf(ShareIndex)
  })
})
