import type { OpenAPIHono } from '@hono/zod-openapi'
import { ShareIndex, type Clock, type ProjectScope, type Role } from '@repo/kernel'
import type { PlanManifest } from '@repo/macroplan-domain'
import { MemoryPlanStore, planManifest } from '@repo/macroplan-domain/testing'
import type { ProjectManifest, ShareLink } from '@repo/microtask-domain'
import {
  MemoryProjectStore,
  fixedClock,
  folder,
  manifest,
  sequentialIds,
  taskDocument,
  taskEntry,
  STAMP,
} from '@repo/microtask-domain/testing'
import { MemoryFileSystem } from '@repo/kernel/testing'
import { QueueLock } from '@repo/store'
import { createApp } from '../app.js'
import { AdminVerifier } from '../auth/admin-verifier.js'
import type { ApiEnv } from '../auth/env.js'
import { readConfig } from '../config.js'
import type { ApiDeps } from '../deps.js'

/**
 * Every id the route fixtures address, so no two suites invent clashing ULIDs.
 *
 * `missing` is well-formed and belongs to nothing, which is the only way to tell a 404 from the
 * 422 a malformed id produces — two failures a client has to act on differently.
 */
export const IDS = {
  p1: '01M240ERCRWWCN16Q5AHP1FZAQ',
  p2: '01M240ERCRWWCN16Q5AHP1FZAR',
  f1: '01M240ERCRWWCN16Q5AHP1FZF1',
  f2: '01M240ERCRWWCN16Q5AHP1FZF2',
  t1: '01M240ERCRWWCN16Q5AHP1FZT1',
  t2: '01M240ERCRWWCN16Q5AHP1FZT2',
  t3: '01M240ERCRWWCN16Q5AHP1FZT3',
  t4: '01M240ERCRWWCN16Q5AHP1FZT4',
  tab1: '01M240ERCRWWCN16Q5AHP1FZB1',
  tab2: '01M240ERCRWWCN16Q5AHP1FZB2',
  tab3: '01M240ERCRWWCN16Q5AHP1FZB3',
  tab4: '01M240ERCRWWCN16Q5AHP1FZB4',
  plan1: '01M240ERCRWWCN16Q5AHP1FZN1',
  missing: '01M240ERCRWWCN16Q5AHP1FZZZ',
} as const

/**
 * One share token per role-and-scope combination the routes have to tell apart.
 *
 * `p2Manage` is the cross-scope probe: it holds every action the policy grants, so a 403 it
 * receives on a project-one route can only be its scope and never its role. A `view` token would
 * prove less — it would be refused twice over, and a route that lost its gate entirely could
 * still look refused.
 */
export const TOKENS = {
  p1View: 'shr_p1_view_seat_token',
  p1Write: 'shr_p1_write_seat_token',
  p1Manage: 'shr_p1_manage_seat_token',
  t1Manage: 'shr_t1_manage_seat_token',
  p2Manage: 'shr_p2_manage_seat_token',
} as const

/**
 * A live Macroplan bearer, deliberately **outside** {@link TOKENS}.
 *
 * One token index serves both products, so a plan's token resolves to a real plan-scoped principal
 * on any route in this app — which is what the Microtask share-description route has to refuse
 * rather than assert away. It is kept out of `TOKENS` because the suites that loop over that map
 * assert every token in it is held by a project in this product, and this one is held by a plan.
 */
export const PLAN_TOKEN = 'shr_plan_manage_seat_tok'

/** The service key the fixture config recognises, presented as `x-api-key`. */
export const SERVICE_KEY = 'k-microtask'

/** Where every guarded path in this product hangs. */
export const GUARDED_PREFIX = '/v1/microtask'

/** The validated configuration every fixture app is built with. */
export const testConfig = readConfig({
  DATA_DIR: '/srv/data',
  ADMIN_PASSWORD: 'correct horse battery staple',
  SESSION_SECRET: 's'.repeat(32),
  SERVICE_KEYS: `microtask=${SERVICE_KEY}`,
})

const clock = fixedClock(STAMP)
const verifier = new AdminVerifier({ config: testConfig, clock })

/**
 * A clock that moves one millisecond every time it is read, starting at {@link STAMP}.
 *
 * The default fixture clock is frozen, and a frozen clock makes the `If-Match` precondition
 * vacuous: a write stamps `updatedAt` with the same value it just compared against, so the next
 * write based on the original stamp still looks current. That is ADR 0016's recorded limitation
 * rather than a defect in the route, and it is why a test that means to measure the precondition
 * drives it with this instead. It starts at `STAMP` so the admin token the fixtures mint — which
 * expires an hour after `STAMP` — is still valid when the deps clock is the one verifying it.
 */
export const tickingClock = (): Clock => {
  let at = Date.parse(STAMP)
  return {
    now: () => {
      at += 1
      return new Date(at).toISOString()
    },
  }
}

const link = (token: string, role: Role, scope: ProjectScope): ShareLink => ({
  token,
  name: 'A seat',
  role,
  scope,
  createdBy: null,
  createdAt: STAMP,
})

const projectOne = (): ProjectManifest =>
  manifest(IDS.p1, {
    folders: [folder(IDS.f1, 'Inbox'), folder(IDS.f2, 'Archive', { position: 1 })],
    tasks: [
      taskEntry(IDS.t1, 'Write the spec', { folderId: IDS.f1 }),
      taskEntry(IDS.t2, 'Ship it'),
      taskEntry(IDS.t3, 'Draft the brief', { position: 1 }),
      taskEntry(IDS.t4, 'Cost it up', { folderId: IDS.f1, position: 1 }),
    ],
    shareLinks: [
      link(TOKENS.p1View, 'view', { kind: 'project', projectId: IDS.p1 }),
      link(TOKENS.p1Write, 'write', { kind: 'project', projectId: IDS.p1 }),
      link(TOKENS.p1Manage, 'manage', { kind: 'project', projectId: IDS.p1 }),
      link(TOKENS.t1Manage, 'manage', { kind: 'task', projectId: IDS.p1, taskId: IDS.t1 }),
    ],
  })

const projectTwo = (): ProjectManifest =>
  manifest(IDS.p2, {
    name: 'Other',
    shareLinks: [link(TOKENS.p2Manage, 'manage', { kind: 'project', projectId: IDS.p2 })],
  })

const planOne = (): PlanManifest =>
  planManifest(IDS.plan1, {
    name: 'Roadmap',
    shareLinks: [
      {
        token: PLAN_TOKEN,
        name: 'A seat',
        role: 'manage',
        createdBy: null,
        createdAt: STAMP,
      },
    ],
  })

/**
 * A fresh dependency surface holding two projects, so one suite's writes cannot reach another's.
 *
 * Project one carries two folders and four tasks — two inside `f1` and two at the root, so a
 * reorder of either group is a real permutation rather than a list of one — plus a link per role.
 * Project two carries a `manage` link of its own and nothing else. Everything is in memory.
 *
 * `fileSystem` is a {@link MemoryFileSystem} rather than the real adapter, because the import
 * routes write through that port and `testConfig.dataDir` is `/srv/data`: with the real adapter a
 * route test would create directories on the machine running it, at an absolute path chosen for a
 * container. No caller is affected — the store here is a `MemoryProjectStore`, so nothing else in
 * the fixture reaches this port — and a suite that wants to see what a route staged holds the
 * deps this returns and reads them back through it.
 */
export async function buildDeps(at: Clock = clock): Promise<ApiDeps> {
  const store = new MemoryProjectStore()
  const plans = new MemoryPlanStore()
  const tokens = new ShareIndex()
  const first = projectOne()
  await store.saveTask('microtask', first, taskDocument(IDS.t1, IDS.tab1))
  await store.saveTask('microtask', first, taskDocument(IDS.t2, IDS.tab2))
  await store.saveTask('microtask', first, taskDocument(IDS.t3, IDS.tab3))
  await store.saveTask('microtask', first, taskDocument(IDS.t4, IDS.tab4))
  const second = projectTwo()
  await store.saveManifest('microtask', second)
  for (const project of [first, second]) {
    tokens.add(
      { product: 'microtask', containerId: project.id },
      project.shareLinks.map((one) => one.token),
    )
  }
  return {
    config: testConfig,
    fileSystem: new MemoryFileSystem(),
    store,
    plans,
    lock: new QueueLock(),
    clock: at,
    ids: sequentialIds(),
    tokens,
  }
}

/** The whole app over a fresh fixture, assembled exactly as production assembles it. */
export async function buildApp(at?: Clock): Promise<OpenAPIHono<ApiEnv>> {
  return createApp(await buildDeps(at))
}

/**
 * The same app over a fixture that also holds one plan, whose {@link PLAN_TOKEN} therefore resolves.
 *
 * Separate from {@link buildDeps} rather than seeded into it, because the plan's token is a share
 * token on the volume and three suites assert what `warmTokenIndex` counts there. Seeding it by
 * default would move those numbers, and a fixture that changes an unrelated count is a fixture that
 * hides the next real change to it.
 */
export async function buildAppWithPlan(): Promise<OpenAPIHono<ApiEnv>> {
  const deps = await buildDeps()
  const plan = planOne()
  await deps.plans.saveManifest('macroplan', plan)
  deps.tokens.add({ product: 'macroplan', containerId: plan.id }, [PLAN_TOKEN])
  return createApp(deps)
}

/** The two credentials an admin presents: the calling app's key, and a freshly minted token. */
export const admin = (): Record<string, string> => ({
  'x-api-key': SERVICE_KEY,
  authorization: `Bearer ${verifier.issue().token}`,
})

/** The two credentials a share-link holder presents. */
export const asLink = (token: string): Record<string, string> => ({
  'x-api-key': SERVICE_KEY,
  authorization: `Bearer ${token}`,
})

/** Admin credentials plus the JSON content type, for a request that carries a body. */
export const adminJson = (): Record<string, string> => ({
  ...admin(),
  'content-type': 'application/json',
})

/** Share-link credentials plus the JSON content type, for a request that carries a body. */
export const linkJson = (token: string): Record<string, string> => ({
  ...asLink(token),
  'content-type': 'application/json',
})

/** A response's JSON body as a bag of unknowns, which is all a test should assume about it. */
export const body = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>
