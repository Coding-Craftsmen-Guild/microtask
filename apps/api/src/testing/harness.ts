import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Role, Scope } from '@repo/kernel'
import { ShareIndex, type ProjectManifest, type ShareLink } from '@repo/microtask-domain'
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
import { NodeFileSystem, QueueLock } from '@repo/store'
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

const link = (token: string, role: Role, scope: Scope): ShareLink => ({
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

/**
 * A fresh dependency surface holding two projects, so one suite's writes cannot reach another's.
 *
 * Project one carries two folders and four tasks — two inside `f1` and two at the root, so a
 * reorder of either group is a real permutation rather than a list of one — plus a link per role.
 * Project two carries a `manage` link of its own and nothing else. Everything is in memory.
 */
export async function buildDeps(): Promise<ApiDeps> {
  const store = new MemoryProjectStore()
  const tokens = new ShareIndex()
  const first = projectOne()
  await store.saveTask('microtask', first, taskDocument(IDS.t1, IDS.tab1))
  await store.saveTask('microtask', first, taskDocument(IDS.t2, IDS.tab2))
  await store.saveTask('microtask', first, taskDocument(IDS.t3, IDS.tab3))
  await store.saveTask('microtask', first, taskDocument(IDS.t4, IDS.tab4))
  const second = projectTwo()
  await store.saveManifest('microtask', second)
  for (const project of [first, second]) tokens.add('microtask', project)
  return {
    config: testConfig,
    fileSystem: new NodeFileSystem(),
    store,
    lock: new QueueLock(),
    clock,
    ids: sequentialIds(),
    tokens,
  }
}

/** The whole app over a fresh fixture, assembled exactly as production assembles it. */
export async function buildApp(): Promise<OpenAPIHono<ApiEnv>> {
  return createApp(await buildDeps())
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
