import { sep } from 'node:path'
import { LIMITS } from '@repo/contracts'
import { Conflict } from '@repo/kernel'
import type { Clock, FileSystem, IdGenerator, Lock } from '@repo/kernel'
import { MemoryFileSystem } from '@repo/kernel/testing'
import {
  FsProjectStore,
  ShareIndex,
  buildDir,
  buildManifestFile,
  buildTaskFile,
  emptyDocument,
  projectDir,
  projectsDir,
  sessionMarkerFile,
  stagingRoot,
  type ProjectManifest,
  type ProjectStore,
  type TaskDocument,
  type WholeProject,
} from '@repo/microtask-domain'
import {
  STAMP,
  folder,
  manifest,
  marked,
  sequentialIds,
  shareLink,
  taskDocument,
  taskEntry,
  token,
} from '@repo/microtask-domain/testing'
import type { OpenAPIHono } from '@hono/zod-openapi'
import { describe, expect, it } from 'vitest'
import { createApp } from '../../app.js'
import { warmTokenIndex } from '../../runtime.js'
import type { ApiEnv } from '../../auth/env.js'
import type { ApiDeps } from '../../deps.js'
import {
  GUARDED_PREFIX,
  IDS,
  SERVICE_KEY,
  TOKENS,
  admin,
  adminJson,
  body,
  buildDeps,
  testConfig,
  tickingClock,
} from '../../testing/harness.js'

const ROOT = testConfig.dataDir
const SESSIONS = `${GUARDED_PREFIX}/import/sessions`
const OCTETS = 'application/octet-stream'

const N1 = marked('01N', 1)
const N2 = marked('01N', 2)
const NT1 = marked('01NT', 1)
const NT2 = marked('01NT', 2)
const NB1 = marked('01NB', 1)
const NB2 = marked('01NB', 2)
const NF1 = marked('01NF', 1)

interface Fixture {
  readonly deps: ApiDeps
  readonly app: OpenAPIHono<ApiEnv>
}

const fixture = async (at?: Clock, over?: Partial<ApiDeps>): Promise<Fixture> => {
  const deps = { ...(await buildDeps(at)), ...over }
  return { deps, app: createApp(deps) }
}

const opened = async (app: OpenAPIHono<ApiEnv>): Promise<string> => {
  const response = await app.request(SESSIONS, { method: 'POST', headers: admin() })
  expect(response.status).toBe(201)
  return String((await body(response))['sessionId'])
}

const stage = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
  at: string,
  text: string,
): Promise<void> => {
  const response = await app.request(
    `${SESSIONS}/${session}/files?path=${encodeURIComponent(at)}&offset=0`,
    { method: 'POST', headers: { ...admin(), 'content-type': OCTETS }, body: text },
  )
  expect([at, response.status]).toEqual([at, 200])
}

interface Dropped {
  readonly manifest: ProjectManifest
  readonly documents: readonly TaskDocument[]
}

const dropped = (
  id: string,
  tasks: readonly string[] = [NT1],
  overrides: Partial<ProjectManifest> = {},
): Dropped => ({
  manifest: manifest(id, {
    name: 'Dropped launch',
    tasks: tasks.map((one, at) => taskEntry(one, `Dropped task ${String(at + 1)}`)),
    ...overrides,
  }),
  documents: tasks.map((one, at) => taskDocument(one, at === 0 ? NB1 : NB2)),
})

const stageProject = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
  drop: Dropped,
  at = 'drop',
): Promise<void> => {
  const where = `${at}/${drop.manifest.id}`
  await stage(app, session, `${where}/project.json`, JSON.stringify(drop.manifest))
  for (const document of drop.documents) {
    await stage(app, session, `${where}/tasks/${document.id}.json`, JSON.stringify(document))
  }
}

const previewed = async (app: OpenAPIHono<ApiEnv>, session: string): Promise<Response> =>
  app.request(`${SESSIONS}/${session}/preview`, { method: 'GET', headers: admin() })

const confirmed = async (
  app: OpenAPIHono<ApiEnv>,
  session: string,
  choices: readonly { projectId: string; choice: string }[] = [],
  sessionId = session,
): Promise<Response> =>
  app.request(`${SESSIONS}/${session}/confirm`, {
    method: 'POST',
    headers: adminJson(),
    body: JSON.stringify({ sessionId, choices }),
  })

const outcomesOf = async (response: Response): Promise<readonly unknown[]> => {
  const parsed = await body(response.clone())
  const projects = parsed['projects'] as readonly Record<string, unknown>[]
  return projects.map((one) => [one['projectId'], one['outcome']])
}

const projectsOf = async (response: Response): Promise<readonly Record<string, unknown>[]> =>
  (await body(response.clone()))['projects'] as readonly Record<string, unknown>[]

const groupsOf = async (response: Response): Promise<readonly Record<string, unknown>[]> =>
  (await body(response.clone()))['groups'] as readonly Record<string, unknown>[]

const sessionIds = async (fix: Fixture): Promise<readonly string[]> =>
  fix.deps.fileSystem.listDirs(stagingRoot(ROOT, 'microtask'))

const storedIds = async (fix: Fixture): Promise<readonly string[]> =>
  (await fix.deps.store.listManifests('microtask')).map((one) => one.id)

describe('GET /v1/microtask/import/sessions/{sessionId}/preview', () => {
  it('answers the plan for what is staged, one row per group', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    const response = await previewed(fix.app, session)
    expect(response.status).toBe(200)
    expect(await groupsOf(response)).toEqual([
      {
        path: `drop/${N1}`,
        shape: 'v2-project-directory',
        projectId: N1,
        name: 'Dropped launch',
        manifestTaskCount: 2,
        taskFilesFound: 2,
        shareLinks: [],
        existsInTarget: false,
        outcome: 'importable',
        reasons: [],
      },
    ])
  })

  it('names the session it describes, so a client cannot render one preview against another', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await body(await previewed(fix.app, session)))['sessionId']).toBe(session)
  })

  it('writes nothing: no project lands, the session keeps its files, and the marker is untouched', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1))
    const at = sessionMarkerFile(ROOT, 'microtask', session)
    const before = await fix.deps.fileSystem.readText(at)
    expect((await previewed(fix.app, session)).status).toBe(200)
    expect(await storedIds(fix)).toEqual([IDS.p1, IDS.p2])
    expect(await sessionIds(fix)).toEqual([session])
    expect(await fix.deps.fileSystem.readText(at)).toBe(before)
    expect(await fix.deps.fileSystem.listDirs(projectsDir(ROOT, 'microtask'))).toEqual([])
  })

  it('answers the same plan twice, a preview being a read and not a step', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1))
    const first = await groupsOf(await previewed(fix.app, session))
    const second = await groupsOf(await previewed(fix.app, session))
    expect(second).toEqual(first)
  })

  it('marks a project the workspace already holds, which is what §7.4 asks the admin about', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1))
    const [row] = await groupsOf(await previewed(fix.app, session))
    expect([row?.['projectId'], row?.['existsInTarget']]).toEqual([IDS.p1, true])
  })

  it('reports a group it cannot read rather than skipping it (ADR 0018)', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/notes.txt', 'this is not JSON at all')
    const [row] = await groupsOf(await previewed(fix.app, session))
    expect([row?.['shape'], row?.['outcome']]).toEqual(['unrecognised', 'error'])
    expect((row?.['reasons'] as readonly string[]).length).toBe(1)
  })

  it('reads a file whose bytes carry a byte-order mark, which JSON.parse alone refuses', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const drop = dropped(N1)
    const mark = String.fromCharCode(0xfeff)
    await stage(fix.app, session, `drop/${N1}/project.json`, mark + JSON.stringify(drop.manifest))
    await stage(
      fix.app,
      session,
      `drop/${N1}/tasks/${NT1}.json`,
      mark + JSON.stringify(drop.documents[0]),
    )
    const [row] = await groupsOf(await previewed(fix.app, session))
    expect([row?.['shape'], row?.['outcome']]).toEqual(['v2-project-directory', 'importable'])
  })

  it('answers 404 for a session id that names nothing, rather than an empty plan', async () => {
    const fix = await fixture()
    const response = await previewed(fix.app, IDS.missing)
    expect([response.status, (await body(response))['code']]).toEqual([404, 'not_found'])
  })

  it('answers an empty plan for a session that stages nothing, which is not an error', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect(await groupsOf(await previewed(fix.app, session))).toEqual([])
  })

  it('carries no share token in the bytes it sends, the response-shape walk never reaching a link', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const secret = token(71)
    const links = { shareLinks: [shareLink(secret, N1, { role: 'manage' as const })] }
    await stageProject(fix.app, session, dropped(N1, [NT1], links))
    const serialised = await (await previewed(fix.app, session)).text()
    const groups = (JSON.parse(serialised) as Record<string, unknown>)['groups']
    const shown = (groups as readonly Record<string, unknown>[])[0]?.['shareLinks']
    expect((shown as readonly unknown[]).length).toBe(1)
    expect(serialised).not.toContain(secret)
  })
})

describe('POST /v1/microtask/import/sessions/{sessionId}/confirm', () => {
  it('creates a project the workspace does not hold, and answers what it did with it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    const response = await confirmed(fix.app, session)
    expect(response.status).toBe(200)
    expect(await projectsOf(response)).toEqual([
      {
        path: `drop/${N1}`,
        projectId: N1,
        writtenProjectId: N1,
        choice: null,
        outcome: 'created',
        tasksWritten: 2,
        tasksRemoved: 0,
        shareLinksReminted: 0,
        shareLinksStranded: 0,
        reasons: [],
      },
    ])
    expect(await storedIds(fix)).toContain(N1)
  })

  it('writes the tasks as well as the manifest, so the project is readable through the API', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    for (const id of [NT1, NT2]) {
      const task = await fix.app.request(`${GUARDED_PREFIX}/projects/${N1}/tasks/${id}`, {
        headers: admin(),
      })
      expect([id, task.status]).toEqual([id, 200])
    }
  })

  it('serves its share links at once, the index being written with the project', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const links = { shareLinks: [shareLink(token(21), N1, { role: 'manage' as const })] }
    await stageProject(fix.app, session, dropped(N1, [NT1], links))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    const read = await fix.app.request(`${GUARDED_PREFIX}/shares/current`, {
      headers: { 'x-api-key': SERVICE_KEY, authorization: `Bearer ${token(21)}` },
    })
    const view = await body(read)
    expect([read.status, (view['project'] as { id?: string }).id]).toEqual([200, N1])
  })

  it('skips a project the admin chose to skip, writing nothing for it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const response = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'skip' }])
    const [row] = await projectsOf(response)
    expect([row?.['outcome'], row?.['writtenProjectId'], row?.['reasons']]).toEqual([
      'skipped',
      null,
      [],
    ])
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.tasks.map((one) => one.id)).toEqual([IDS.t1, IDS.t2, IDS.t3, IDS.t4])
  })

  it('replaces a colliding project, dropping the tasks the bundle does not carry', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const response = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    const [row] = await projectsOf(response)
    expect([row?.['outcome'], row?.['writtenProjectId'], row?.['tasksRemoved']]).toEqual([
      'replaced',
      IDS.p1,
      3,
    ])
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.tasks.map((one) => one.id)).toEqual([IDS.t1])
    expect(await fix.deps.store.readTask('microtask', IDS.p1, IDS.t2)).toBeNull()
  })

  it('keeps the share links the bundle never mentions, an export being no revocation', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(applied.status).toBe(200)
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.shareLinks.map((one) => one.token)).toEqual([
      TOKENS.p1View,
      TOKENS.p1Write,
      TOKENS.p1Manage,
      TOKENS.t1Manage,
    ])
  })

  it('counts a kept link whose task the admin just dropped, rather than revoking or widening it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t2]))
    const response = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    const [row] = await projectsOf(response)
    expect([row?.['outcome'], row?.['shareLinksStranded']]).toEqual(['replaced', 1])
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.shareLinks.length).toBe(4)
  })

  it('imports a colliding project as new, leaving the one on disk exactly as it was', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const links = { shareLinks: [shareLink(token(31), IDS.p1), shareLink(token(32), IDS.p1)] }
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1], links))
    const response = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'new' }])
    const [row] = await projectsOf(response)
    expect([row?.['outcome'], row?.['projectId'], row?.['shareLinksReminted']]).toEqual([
      'created',
      IDS.p1,
      2,
    ])
    expect(row?.['writtenProjectId']).not.toBe(IDS.p1)
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.tasks.map((one) => one.id)).toEqual([IDS.t1, IDS.t2, IDS.t3, IDS.t4])
    expect((await storedIds(fix)).length).toBe(3)
  })

  it('remints every token it imports as new, so no live URL opens the copy', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const links = { shareLinks: [shareLink(token(31), IDS.p1)] }
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1], links))
    const response = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'new' }])
    const minted = String((await projectsOf(response))[0]?.['writtenProjectId'])
    const copy = await fix.deps.store.readManifest('microtask', minted)
    expect(copy?.shareLinks.map((one) => one.token)).not.toEqual([token(31)])
    expect(copy?.shareLinks.length).toBe(1)
    expect(fix.deps.tokens.find(token(31))).toBeNull()
  })

  it('treats a replace of a project that is no longer there as the create it has become', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const response = await confirmed(fix.app, session, [{ projectId: N1, choice: 'replace' }])
    const [row] = await projectsOf(response)
    expect([row?.['outcome'], row?.['choice'], row?.['tasksRemoved']]).toEqual([
      'created',
      'replace',
      0,
    ])
  })
})

describe('the choice set, and the two ways it can be refused before anything is written', () => {
  it('refuses a choice naming a project the session does not stage, with a 422 naming the id', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const response = await confirmed(fix.app, session, [{ projectId: N2, choice: 'skip' }])
    const problem = await body(response)
    expect([response.status, problem['code']]).toEqual([422, 'invalid'])
    expect(String(problem['detail'])).toContain(N2)
  })

  it('refuses a colliding project left with no choice, with a 409 naming it', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const response = await confirmed(fix.app, session)
    const problem = await body(response)
    expect([response.status, problem['code']]).toEqual([409, 'conflict'])
    expect(String(problem['detail'])).toContain(IDS.p1)
  })

  it('leaves the session staged when it refuses a choice set, so the admin can fix it and confirm', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    expect((await confirmed(fix.app, session)).status).toBe(409)
    expect(await sessionIds(fix)).toEqual([session])
    const again = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'skip' }])
    expect(again.status).toBe(200)
  })

  it('leaves the session staged when it refuses an unknown choice too, not only a missing one', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const refused = await confirmed(fix.app, session, [{ projectId: N2, choice: 'skip' }])
    expect(refused.status).toBe(422)
    expect(await sessionIds(fix)).toEqual([session])
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await storedIds(fix)).toContain(N1)
  })

  it('writes nothing when it refuses a choice set, the refusal coming before the apply', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    await stageProject(fix.app, session, dropped(N2, [NT2]))
    const refused = await confirmed(fix.app, session, [{ projectId: IDS.missing, choice: 'skip' }])
    expect(refused.status).toBe(422)
    expect(await storedIds(fix)).toEqual([IDS.p1, IDS.p2])
  })

  it('needs no choice for a blocked collision, which was never going to land', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const broken = dropped(IDS.p1, [IDS.t1])
    await stage(fix.app, session, `drop/${IDS.p1}/project.json`, JSON.stringify(broken.manifest))
    const response = await confirmed(fix.app, session)
    expect(response.status).toBe(200)
    expect(await outcomesOf(response)).toEqual([[IDS.p1, 'blocked']])
  })

  it('refuses a body naming a different session from the path, rather than picking one', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    const response = await confirmed(fix.app, session, [], IDS.missing)
    expect([response.status, (await body(response))['code']]).toEqual([422, 'invalid'])
    expect(await sessionIds(fix)).toEqual([session])
  })

  it('answers 404 for a session id that names nothing, before any choice is looked at', async () => {
    const fix = await fixture()
    const response = await confirmed(fix.app, IDS.missing)
    expect([response.status, (await body(response))['code']]).toEqual([404, 'not_found'])
  })
})

const BUNDLE_STAMPS = {
  projectCreated: '2025-01-02T03:04:05.000Z',
  projectUpdated: '2025-02-03T04:05:06.000Z',
  folderCreated: '2025-03-04T05:06:07.000Z',
  folderUpdated: '2025-04-05T06:07:08.000Z',
  taskCreated: '2025-05-06T07:08:09.000Z',
  taskUpdated: '2025-06-07T08:09:10.000Z',
  tabCreated: '2025-07-08T09:10:11.000Z',
  tabUpdated: '2025-08-09T10:11:12.000Z',
} as const

const stampedDrop = (id: string): Dropped => {
  const tab = {
    id: NB1,
    name: 'General',
    position: 0,
    document: emptyDocument(),
    createdAt: BUNDLE_STAMPS.tabCreated,
    updatedAt: BUNDLE_STAMPS.tabUpdated,
  }
  const document: TaskDocument = {
    id: NT1,
    tabs: [tab],
    createdAt: BUNDLE_STAMPS.taskCreated,
    updatedAt: BUNDLE_STAMPS.taskUpdated,
  }
  return {
    manifest: manifest(id, {
      name: 'Dated launch',
      folders: [
        folder(NF1, 'Inbox', {
          createdAt: BUNDLE_STAMPS.folderCreated,
          updatedAt: BUNDLE_STAMPS.folderUpdated,
        }),
      ],
      tasks: [taskEntry(NT1, 'Dated task', { updatedAt: BUNDLE_STAMPS.taskUpdated })],
      createdAt: BUNDLE_STAMPS.projectCreated,
      updatedAt: BUNDLE_STAMPS.projectUpdated,
    }),
    documents: [document],
  }
}

const stampsWritten = async (fix: Fixture, id: string): Promise<readonly string[]> => {
  const live = await fix.deps.store.readManifest('microtask', id)
  const document = await fix.deps.store.readTask('microtask', id, NT1)
  if (live === null || document === null) throw new Error('the project was not written at all')
  return [
    live.createdAt,
    live.updatedAt,
    ...live.folders.flatMap((one) => [one.createdAt, one.updatedAt]),
    ...live.tasks.map((one) => one.updatedAt),
    document.createdAt,
    document.updatedAt,
    ...document.tabs.flatMap((one) => [one.createdAt, one.updatedAt]),
  ]
}

const BUNDLE_ORDER: readonly string[] = [
  BUNDLE_STAMPS.projectCreated,
  BUNDLE_STAMPS.projectUpdated,
  BUNDLE_STAMPS.folderCreated,
  BUNDLE_STAMPS.folderUpdated,
  BUNDLE_STAMPS.taskUpdated,
  BUNDLE_STAMPS.taskCreated,
  BUNDLE_STAMPS.taskUpdated,
  BUNDLE_STAMPS.tabCreated,
  BUNDLE_STAMPS.tabUpdated,
]

describe('import writes the timestamps a bundle carries and stamps nothing (design §7.4)', () => {
  it('writes every stamp back as the exact string the bundle carried, creating a project', async () => {
    const fix = await fixture(tickingClock())
    const session = await opened(fix.app)
    await stageProject(fix.app, session, stampedDrop(N1))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await stampsWritten(fix, N1)).toEqual(BUNDLE_ORDER)
  })

  it('writes them back on a replace too, which is the case where tokens are already live', async () => {
    const fix = await fixture(tickingClock())
    const session = await opened(fix.app)
    const drop = stampedDrop(IDS.p1)
    await stageProject(fix.app, session, drop)
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(applied.status).toBe(200)
    expect(await stampsWritten(fix, IDS.p1)).toEqual(BUNDLE_ORDER)
  })

  it('writes them back on a remint, which rewrites every id and touches no stamp', async () => {
    const fix = await fixture(tickingClock())
    const session = await opened(fix.app)
    await stageProject(fix.app, session, stampedDrop(IDS.p1))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'new' }])
    const minted = String((await projectsOf(applied))[0]?.['writtenProjectId'])
    const live = await fix.deps.store.readManifest('microtask', minted)
    expect([live?.createdAt, live?.updatedAt]).toEqual([
      BUNDLE_STAMPS.projectCreated,
      BUNDLE_STAMPS.projectUpdated,
    ])
    expect(live?.tasks.map((one) => one.updatedAt)).toEqual([BUNDLE_STAMPS.taskUpdated])
  })

  it('drove that with a clock that moves, so a stamped value would differ from a preserved one', async () => {
    const clock = tickingClock()
    const first = clock.now()
    const second = clock.now()
    expect(first).not.toBe(second)
    expect(first.startsWith('2026-09-10')).toBe(true)
  })

  it('carries bundle stamps that no clock in this harness could produce, so equality has teeth', () => {
    expect(new Set(BUNDLE_ORDER).size).toBe(8)
    for (const one of BUNDLE_ORDER) {
      expect([one, one === STAMP]).toEqual([one, false])
      expect([one, one.startsWith('2026-09-10')]).toEqual([one, false])
    }
  })
})

const countingLock = (inner: Lock): { lock: Lock; runs: () => number } => {
  let runs = 0
  const lock: Lock = {
    run: (work) => {
      runs += 1
      return inner.run(work)
    },
  }
  return { lock, runs: () => runs }
}

const within = async (work: Promise<unknown>, ms: number): Promise<unknown> => {
  const timer = new Promise((resolve) => setTimeout(() => resolve('never settled'), ms))
  return Promise.race([work, timer])
}

describe('the write lock a confirm takes, which QueueLock does not let it take twice', () => {
  it('takes it exactly once for a whole apply, however many projects the session holds — measured: this names an unawaited nested run as 4, where an awaited one hangs the confirm and this case with it', async () => {
    const base = await buildDeps()
    const counted = countingLock(base.lock)
    const fix = await fixture(undefined, { ...base, lock: counted.lock })
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    await stageProject(fix.app, session, dropped(N2, [NT2]))
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const before = counted.runs()
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(applied.status).toBe(200)
    expect(counted.runs() - before).toBe(1)
  })

  it('takes none at all for a preview, a read not being what the lock protects', async () => {
    const base = await buildDeps()
    const counted = countingLock(base.lock)
    const fix = await fixture(undefined, { ...base, lock: counted.lock })
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const before = counted.runs()
    expect((await previewed(fix.app, session)).status).toBe(200)
    expect(counted.runs() - before).toBe(0)
  })

  it('leaves the queue settling after a confirm returns — a weaker guard, since an awaited nested run hangs the confirm itself and never reaches this race', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    const write = Promise.resolve(
      fix.app.request(`${GUARDED_PREFIX}/projects`, {
        method: 'POST',
        headers: adminJson(),
        body: JSON.stringify({ name: 'After the import' }),
      }),
    ).then((response) => response.status)
    expect(await within(write, 2000)).toBe(201)
  })

  it('keeps reads answering after a confirm, so a wedged queue would be a write outage and not a total one', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    const read = Promise.resolve(fix.app.request('/healthz')).then((one) => one.status)
    expect(await within(read, 2000)).toBe(200)
  })
})

const delegating = (inner: ProjectStore, over: Partial<ProjectStore>): ProjectStore => ({
  listManifests: (product) => inner.listManifests(product),
  readManifest: (product, projectId) => inner.readManifest(product, projectId),
  readTask: (product, projectId, taskId) => inner.readTask(product, projectId, taskId),
  saveManifest: (product, project) => inner.saveManifest(product, project),
  saveTask: (product, project, task) => inner.saveTask(product, project, task),
  deleteTask: (product, project, taskId) => inner.deleteTask(product, project, taskId),
  publishProject: (product, project) => inner.publishProject(product, project),
  deleteProject: (product, projectId) => inner.deleteProject(product, projectId),
  ...over,
})

describe('the lost update the one lock prevents, driven through the apply’s own read window', () => {
  const interleaved = async (): Promise<{
    fix: Fixture
    concurrent: () => Promise<Response>
  }> => {
    const base = await buildDeps()
    let started: Promise<Response> | null = null
    let fire: () => Promise<Response> = async () => new Response()
    let armed = true
    const store = delegating(base.store, {
      readManifest: async (product, projectId) => {
        const found = await base.store.readManifest(product, projectId)
        if (armed && projectId === IDS.p1) {
          armed = false
          started = fire()
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        return found
      },
    })
    const fix = await fixture(undefined, { ...base, store })
    fire = async () =>
      fix.app.request(`${GUARDED_PREFIX}/projects/${IDS.p1}/share-links`, {
        method: 'POST',
        headers: adminJson(),
        body: JSON.stringify({
          name: 'Minted mid-import',
          role: 'view',
          scope: { kind: 'project', projectId: IDS.p1 },
        }),
      })
    return { fix, concurrent: async () => (await started) ?? new Response() }
  }

  it('keeps a share link minted inside the apply’s read-modify-write window', async () => {
    const { fix, concurrent } = await interleaved()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(applied.status).toBe(200)
    expect((await concurrent()).status).toBe(201)
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.shareLinks.map((one) => one.name)).toContain('Minted mid-import')
  })

  it('keeps the import too, so the invariant is that neither write is the one that is lost', async () => {
    const { fix, concurrent } = await interleaved()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    expect((await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])).status).toBe(200)
    expect((await concurrent()).status).toBe(201)
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.tasks.map((one) => one.id)).toEqual([IDS.t1])
    expect(live?.shareLinks.length).toBe(5)
  })

  it('did interleave: the concurrent write was launched from inside the apply, not after it', async () => {
    const { fix, concurrent } = await interleaved()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(applied.status).toBe(200)
    expect((await concurrent()).status).toBe(201)
  })
})

describe('per-project outcomes: a failure on one project does not take the rest with it', () => {
  const breaking = async (failFor: string): Promise<Fixture> => {
    const base = await buildDeps()
    const store = delegating(base.store, {
      publishProject: async (product, project: WholeProject) => {
        if (project.manifest.id === failFor) throw new Error('the volume is full')
        await base.store.publishProject(product, project)
      },
    })
    return fixture(undefined, { ...base, store })
  }

  it('lands the projects it can and reports the one it could not, with the reason it gave', async () => {
    const fix = await breaking(N2)
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    await stageProject(fix.app, session, dropped(N2, [NT2]))
    const applied = await confirmed(fix.app, session)
    expect(applied.status).toBe(200)
    expect(await outcomesOf(applied)).toEqual([
      [N1, 'created'],
      [N2, 'failed'],
    ])
    const rows = await projectsOf(applied)
    expect(String((rows[1]?.['reasons'] as readonly string[])[0])).toContain('could not be written')
    expect(await storedIds(fix)).toContain(N1)
    expect(await storedIds(fix)).not.toContain(N2)
  })

  it('does not echo a volume’s own message, which carries the container path it failed on', async () => {
    const base = await buildDeps()
    const leaky = `EPERM: operation not permitted, rename '${ROOT}/microtask/build/${N1}'`
    const store = delegating(base.store, {
      publishProject: async () => {
        throw new Error(leaky)
      },
    })
    const fix = await fixture(undefined, { ...base, store })
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const applied = await confirmed(fix.app, session)
    const said = JSON.stringify(await projectsOf(applied))
    expect(said).not.toContain('EPERM')
    expect(said).not.toContain(ROOT)
    expect(said).toContain('See the server log')
  })

  it('does echo an AppError, that being the class this repo writes for a caller to read', async () => {
    const base = await buildDeps()
    const store = delegating(base.store, {
      publishProject: async () => {
        throw new Conflict('Share token already belongs to another project: tok_x')
      },
    })
    const fix = await fixture(undefined, { ...base, store })
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const applied = await confirmed(fix.app, session)
    const [row] = await projectsOf(applied)
    expect(row?.['reasons']).toEqual(['Share token already belongs to another project: tok_x'])
  })

  it('reports a blocked project beside a created one, both in the order they were dropped', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const broken = dropped(N2, [NT2])
    await stage(fix.app, session, `drop/${N2}/project.json`, JSON.stringify(broken.manifest))
    const applied = await confirmed(fix.app, session)
    expect(await outcomesOf(applied)).toEqual([
      [N1, 'created'],
      [N2, 'blocked'],
    ])
    expect((await projectsOf(applied))[1]?.['reasons']).not.toEqual([])
  })

  it('names the session it applied, so a response can be joined to the plan it came from', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    expect((await body(await confirmed(fix.app, session)))['sessionId']).toBe(session)
  })
})

describe('the session a confirm applied is swept, success or failure (ADR 0045)', () => {
  it('sweeps it after a confirm that wrote every project', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await sessionIds(fix)).toEqual([])
  })

  it('sweeps it after a confirm where a project failed to be written', async () => {
    const base = await buildDeps()
    const store = delegating(base.store, {
      publishProject: async () => {
        throw new Error('the volume is full')
      },
    })
    const fix = await fixture(undefined, { ...base, store })
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    const applied = await confirmed(fix.app, session)
    expect(await outcomesOf(applied)).toEqual([[N1, 'failed']])
    expect(await sessionIds(fix)).toEqual([])
  })

  it('answers 404 the second time, the session it applied no longer being there', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect((await confirmed(fix.app, session)).status).toBe(404)
    expect((await previewed(fix.app, session)).status).toBe(404)
  })

  it('sweeps a session whose every group was refused, there being nothing left to retry', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/notes.txt', 'not JSON')
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await sessionIds(fix)).toEqual([])
  })
})

const BUILD_SEGMENT = `${sep}build${sep}`

class Publishing implements FileSystem {
  readonly writes: string[] = []
  readonly moves: string[] = []
  killMove = false
  killBuildWrite = false
  killClear: (dir: string) => boolean = () => false

  readonly #inner = new MemoryFileSystem()

  async readText(file: string) {
    return this.#inner.readText(file)
  }

  async writeTextAtomic(file: string, text: string) {
    if (this.killBuildWrite && file.includes(BUILD_SEGMENT)) throw new Error('killed mid-build')
    this.writes.push(file)
    await this.#inner.writeTextAtomic(file, text)
  }

  async readBytes(file: string) {
    return this.#inner.readBytes(file)
  }

  async appendBytes(file: string, bytes: Uint8Array) {
    this.writes.push(file)
    await this.#inner.appendBytes(file, bytes)
  }

  async remove(file: string) {
    return this.#inner.remove(file)
  }

  async removeDir(dir: string) {
    if (this.killClear(dir)) throw new Error('killed mid-clear')
    return this.#inner.removeDir(dir)
  }

  async listDirs(dir: string) {
    return this.#inner.listDirs(dir)
  }

  async listFiles(dir: string) {
    return this.#inner.listFiles(dir)
  }

  async size(file: string) {
    return this.#inner.size(file)
  }

  async move(from: string, to: string) {
    this.moves.push(to)
    if (this.killMove) throw new Error('killed mid-move')
    await this.#inner.move(from, to)
  }
}

interface OnDisk {
  readonly fix: Fixture
  readonly files: Publishing
}

const onDisk = async (): Promise<OnDisk> => {
  const base = await buildDeps()
  const files = new Publishing()
  const store = new FsProjectStore({ files, root: () => ROOT })
  const deps: ApiDeps = { ...base, fileSystem: files, store, tokens: new ShareIndex() }
  return { fix: { deps, app: createApp(deps) }, files }
}

const underProjects = (files: Publishing): readonly string[] => {
  const root = projectsDir(ROOT, 'microtask')
  return files.writes.filter((one) => one.startsWith(root))
}

describe('ADR 0006’s bulk rule through the composed app: built whole, then moved into place', () => {
  it('writes no file under projects/ at all, publishing with exactly one move onto it', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    files.moves.length = 0
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(underProjects(files)).toEqual([])
    expect(files.moves).toEqual([projectDir(ROOT, 'microtask', N1)])
  })

  it('shows the project wholly present afterwards, manifest and every task readable', async () => {
    const { fix } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await storedIds(fix)).toEqual([N1])
    for (const id of [NT1, NT2]) {
      expect([id, await fix.deps.store.readTask('microtask', N1, id)]).not.toEqual([id, null])
    }
  })

  it('shows it wholly absent when the move dies, and reports that project failed', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    files.killMove = true
    const applied = await confirmed(fix.app, session)
    expect(await outcomesOf(applied)).toEqual([[N1, 'failed']])
    expect(await storedIds(fix)).toEqual([])
    expect(await fix.deps.store.readManifest('microtask', N1)).toBeNull()
    expect(await fix.deps.store.readTask('microtask', N1, NT1)).toBeNull()
  })

  it('had in fact built the whole project when that move died, so absence is the publish', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    files.killMove = true
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await files.readText(buildManifestFile(ROOT, 'microtask', N1))).not.toBeNull()
    for (const id of [NT1, NT2]) {
      const at = buildTaskFile(ROOT, 'microtask', N1, id)
      expect([id, await files.readText(at)]).not.toEqual([id, null])
    }
  })

  it('leaves a replaced project wholly absent rather than half replaced, the window this names', async () => {
    const { fix, files } = await onDisk()
    const live = dropped(IDS.p1, [IDS.t1, IDS.t2])
    await fix.deps.store.publishProject('microtask', live)
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    files.killMove = true
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(await outcomesOf(applied)).toEqual([[IDS.p1, 'failed']])
    expect(await fix.deps.store.readManifest('microtask', IDS.p1)).toBeNull()
    expect(await fix.deps.store.readTask('microtask', IDS.p1, IDS.t1)).toBeNull()
  })

  it('never publishes a manifest naming a task file that is not beside it, however it is read', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    const published = files.writes.filter((one) => one.startsWith(buildDir(ROOT, 'microtask', N1)))
    expect(published).toEqual([
      buildTaskFile(ROOT, 'microtask', N1, NT1),
      buildTaskFile(ROOT, 'microtask', N1, NT2),
      buildManifestFile(ROOT, 'microtask', N1),
    ])
  })
})

describe('a remint is re-checked and a replace is not, which is the asymmetry Group B settled', () => {
  const filled = async (): Promise<Fixture> => {
    const fix = await fixture()
    for (let at = 3; at <= LIMITS.projectsPerProduct; at += 1) {
      await fix.deps.store.saveManifest('microtask', manifest(marked('01FK', at)))
    }
    expect((await storedIds(fix)).length).toBe(LIMITS.projectsPerProduct)
    return fix
  }

  it('blocks a remint that would take the store over projectsPerProduct, which a replace does not', async () => {
    const fix = await filled()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'new' }])
    const [row] = await projectsOf(applied)
    expect([row?.['outcome'], row?.['writtenProjectId']]).toEqual(['blocked', null])
    expect(String((row?.['reasons'] as readonly string[])[0])).toContain('projects')
    expect((await storedIds(fix)).length).toBe(LIMITS.projectsPerProduct)
  })

  it('lets the replace of that very project through, it adding none — so that block is the remint', async () => {
    const fix = await filled()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(await outcomesOf(applied)).toEqual([[IDS.p1, 'replaced']])
    expect((await storedIds(fix)).length).toBe(LIMITS.projectsPerProduct)
  })

  it('previews that same project as importable, the cap having nothing to say until it is reminted', async () => {
    const fix = await filled()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    const [row] = await groupsOf(await previewed(fix.app, session))
    expect([row?.['outcome'], row?.['existsInTarget']]).toEqual(['importable', true])
  })
})

describe('the destination a publish has to clear before the move can land (criterion 5)', () => {
  it('replaces a project already on disk, which needs the destination cleared first', async () => {
    const { fix, files } = await onDisk()
    await fix.deps.store.publishProject('microtask', dropped(IDS.p1, [IDS.t1, IDS.t2]))
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    files.moves.length = 0
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    expect(await outcomesOf(applied)).toEqual([[IDS.p1, 'replaced']])
    expect(files.moves).toEqual([projectDir(ROOT, 'microtask', IDS.p1)])
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.tasks.map((one) => one.id)).toEqual([IDS.t1])
    expect(await fix.deps.store.readTask('microtask', IDS.p1, IDS.t2)).toBeNull()
  })

  it('leaves no build directory behind once the move has consumed it', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    expect(await files.listDirs(buildDir(ROOT, 'microtask', N1))).toEqual([])
    expect(await files.readText(buildManifestFile(ROOT, 'microtask', N1))).toBeNull()
  })

  it('reclaims a build directory an earlier failure left, rather than moving its leftovers along', async () => {
    const { fix, files } = await onDisk()
    const stale = buildTaskFile(ROOT, 'microtask', N1, NT2)
    await files.writeTextAtomic(stale, '{"id":"left by an interrupted publish"}')
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    const live = await fix.deps.store.readManifest('microtask', N1)
    expect(live?.tasks.map((one) => one.id)).toEqual([NT1])
    expect(await fix.deps.store.readTask('microtask', N1, NT2)).toBeNull()
  })
})

describe('which project a replace resolves against, nothing inside replaceProject enforcing it', () => {
  it('resolves it by the incoming manifest id, not by whatever the store happened to list first', async () => {
    const fix = await fixture()
    expect(await storedIds(fix)).toEqual([IDS.p1, IDS.p2])
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p2, [NT1]))
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p2, choice: 'replace' }])
    const [row] = await projectsOf(applied)
    expect([row?.['outcome'], row?.['writtenProjectId'], row?.['tasksRemoved']]).toEqual([
      'replaced',
      IDS.p2,
      0,
    ])
    const live = await fix.deps.store.readManifest('microtask', IDS.p2)
    expect(live?.shareLinks.map((one) => one.token)).toEqual([TOKENS.p2Manage])
    expect(live?.tasks.map((one) => one.id)).toEqual([NT1])
  })

  it('leaves the project it did not name exactly as it was, links and tasks alike', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p2, [NT1]))
    expect((await confirmed(fix.app, session, [{ projectId: IDS.p2, choice: 'replace' }])).status).toBe(200)
    const other = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(other?.tasks.map((one) => one.id)).toEqual([IDS.t1, IDS.t2, IDS.t3, IDS.t4])
    expect(other?.shareLinks.length).toBe(4)
  })
})

const REPEATED = token(99)

const repeatingIds = (): IdGenerator => {
  const inner = sequentialIds()
  return { entityId: () => inner.entityId(), token: () => REPEATED }
}

describe('the token index is written before the project, and that refusal is reachable', () => {
  const clashing = async (): Promise<Fixture> => {
    const base = await buildDeps()
    const fix = await fixture(undefined, { ...base, ids: repeatingIds() })
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1], { shareLinks: [shareLink(token(41), IDS.p1)] }))
    await stageProject(fix.app, session, dropped(N1, [NT1], { shareLinks: [shareLink(REPEATED, N1)] }))
    return fix
  }

  it('previews both as importable, carriers() seeing only the tokens the drops arrived with', async () => {
    const fix = await clashing()
    const [session] = await sessionIds(fix)
    const rows = await groupsOf(await previewed(fix.app, String(session)))
    expect(rows.map((one) => [one['projectId'], one['outcome']])).toEqual([
      [IDS.p1, 'importable'],
      [N1, 'importable'],
    ])
  })

  it('lands the first and refuses the second, the remint having taken the token in between', async () => {
    const fix = await clashing()
    const [session] = await sessionIds(fix)
    const applied = await confirmed(fix.app, String(session), [{ projectId: IDS.p1, choice: 'new' }])
    expect(applied.status).toBe(200)
    const rows = await projectsOf(applied)
    expect(rows.map((one) => one['outcome'])).toEqual(['created', 'failed'])
    expect(String((rows[1]?.['reasons'] as readonly string[])[0])).toContain(
      'already belongs to another project',
    )
  })

  it('leaves the refused project unwritten, so no two projects on disk hold one token', async () => {
    const fix = await clashing()
    const [session] = await sessionIds(fix)
    await confirmed(fix.app, String(session), [{ projectId: IDS.p1, choice: 'new' }])
    expect(await storedIds(fix)).not.toContain(N1)
    const held = (await fix.deps.store.listManifests('microtask')).flatMap((one) =>
      one.shareLinks.map((link) => link.token),
    )
    expect(new Set(held).size).toBe(held.length)
  })

  it('still opens a socket at the next restart, which the other write order would not', async () => {
    const fix = await clashing()
    const [session] = await sessionIds(fix)
    await confirmed(fix.app, String(session), [{ projectId: IDS.p1, choice: 'new' }])
    const rebuilt: ApiDeps = { ...fix.deps, tokens: new ShareIndex() }
    await expect(warmTokenIndex(rebuilt)).resolves.toBeGreaterThan(0)
  })
})

describe('a legacy project and a bundle reach disk too, not only a project directory (ADR 0018)', () => {
  const LEGACY_STAMP = '2019-04-05T06:07:08.000Z'
  const LT1 = marked('01KT', 1)
  const LT2 = marked('01KT', 2)

  const legacyFile = (id: string): string =>
    JSON.stringify({
      id,
      name: 'The old workspace',
      createdAt: LEGACY_STAMP,
      updatedAt: LEGACY_STAMP,
      tabs: [
        {
          id: LT1,
          name: 'Kitchen',
          position: 0,
          document: emptyDocument(),
          createdAt: LEGACY_STAMP,
          updatedAt: LEGACY_STAMP,
        },
        {
          id: LT2,
          name: 'Garden',
          position: 1,
          document: emptyDocument(),
          createdAt: LEGACY_STAMP,
          updatedAt: LEGACY_STAMP,
        },
      ],
      shareLinks: [{ token: token(51), name: 'The old link', permission: 'read' }],
    })

  const bundleFile = (ids: readonly string[]): string =>
    JSON.stringify({
      format: 'ccg.microtask',
      version: 2,
      exportedAt: STAMP,
      bundleId: marked('01X', 1),
      projects: ids.map((id) => {
        const drop = dropped(id, [NT1])
        return { ...drop.manifest, taskDocuments: drop.documents }
      }),
    })

  it('lands a legacy file as a project whose tasks keep the file’s own ids and stamps', async () => {
    const fix = await fixture(tickingClock())
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/old-workspace.json', legacyFile(N1))
    const applied = await confirmed(fix.app, session)
    expect(await outcomesOf(applied)).toEqual([[N1, 'created']])
    const live = await fix.deps.store.readManifest('microtask', N1)
    expect(live?.tasks.map((one) => [one.id, one.name])).toEqual([
      [LT1, 'Kitchen'],
      [LT2, 'Garden'],
    ])
    expect([live?.createdAt, live?.updatedAt]).toEqual([LEGACY_STAMP, LEGACY_STAMP])
  })

  it('converts its read permission to a project-scoped view link that serves at once', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/old-workspace.json', legacyFile(N1))
    expect((await confirmed(fix.app, session)).status).toBe(200)
    const live = await fix.deps.store.readManifest('microtask', N1)
    expect(live?.shareLinks).toMatchObject([
      { token: token(51), role: 'view', scope: { kind: 'project', projectId: N1 } },
    ])
    const read = await fix.app.request(`${GUARDED_PREFIX}/shares/current`, {
      headers: { 'x-api-key': SERVICE_KEY, authorization: `Bearer ${token(51)}` },
    })
    expect(read.status).toBe(200)
  })

  it('previews a legacy file identically twice, a tab id reaching no field a row carries', async () => {
    const fix = await fixture(tickingClock())
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/old-workspace.json', legacyFile(N1))
    const first = await previewed(fix.app, session)
    const second = await previewed(fix.app, session)
    expect(await second.text()).toBe(await first.text())
  })

  it('lands both projects of a workspace bundle, each as its own row', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/workspace.json', bundleFile([N1, N2]))
    const applied = await confirmed(fix.app, session)
    expect(await outcomesOf(applied)).toEqual([
      [N1, 'created'],
      [N2, 'created'],
    ])
    expect(await storedIds(fix)).toContain(N1)
    expect(await storedIds(fix)).toContain(N2)
    expect(await fix.deps.store.readTask('microtask', N2, NT1)).not.toBeNull()
  })

  it('labels those two rows by position in the file, there being nothing else to tell them apart', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/workspace.json', bundleFile([N1, N2]))
    expect((await projectsOf(await confirmed(fix.app, session))).map((one) => one['path'])).toEqual([
      'drop/workspace.json project 1',
      'drop/workspace.json project 2',
    ])
  })

  it('lands a single-project bundle under the file’s own path, that file being the project', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stage(fix.app, session, 'drop/one-project.json', bundleFile([N1]))
    const rows = await projectsOf(await confirmed(fix.app, session))
    expect(rows.map((one) => [one['path'], one['outcome']])).toEqual([
      ['drop/one-project.json', 'created'],
    ])
    expect(await storedIds(fix)).toContain(N1)
  })

  it('lands all three shapes in one confirm, which is what a real migration drops', async () => {
    const fix = await fixture()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(marked('01D', 1), [NT1]))
    await stage(fix.app, session, 'drop/old.json', legacyFile(N1))
    await stage(fix.app, session, 'drop/bundle.json', bundleFile([N2]))
    const applied = await confirmed(fix.app, session)
    const rows = await projectsOf(applied)
    expect(rows.map((one) => one['outcome'])).toEqual(['created', 'created', 'created'])
    expect((await storedIds(fix)).length).toBe(5)
  })
})

describe('a destructive failure is told apart from a harmless one in the row (ADR 0045 amended)', () => {
  const reasonOf = async (response: Response): Promise<string> =>
    String(((await projectsOf(response))[0]?.['reasons'] as readonly string[])[0])

  it('names build/<projectId>/ when the rename died, that copy being the whole recovery', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    files.killMove = true
    const applied = await confirmed(fix.app, session)
    const why = await reasonOf(applied)
    expect(why).toContain(`build/${N1}/`)
    expect(why).toContain('this project is gone')
    expect(await fix.deps.store.readManifest('microtask', N1)).toBeNull()
  })

  it('says nothing about a build directory when the build died, the project being untouched', async () => {
    const { fix, files } = await onDisk()
    await fix.deps.store.publishProject('microtask', dropped(IDS.p1, [IDS.t1, IDS.t2]))
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    files.killBuildWrite = true
    const applied = await confirmed(fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }])
    const why = await reasonOf(applied)
    expect(why).not.toContain('build/')
    expect(why).toContain('is untouched')
    const live = await fix.deps.store.readManifest('microtask', IDS.p1)
    expect(live?.tasks.map((one) => one.id)).toEqual([IDS.t1, IDS.t2])
  })

  it('reports both as failed, so the word alone is what cannot tell them apart', async () => {
    const both: string[] = []
    for (const kill of ['move', 'build'] as const) {
      const { fix, files } = await onDisk()
      const session = await opened(fix.app)
      await stageProject(fix.app, session, dropped(N1, [NT1]))
      if (kill === 'move') files.killMove = true
      else files.killBuildWrite = true
      const applied = await confirmed(fix.app, session)
      expect(await outcomesOf(applied)).toEqual([[N1, 'failed']])
      both.push(await reasonOf(applied))
    }
    expect(both[0]).not.toBe(both[1])
  })

  it('keeps the platform’s own rejection out of the row, however the publish died', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1]))
    files.killMove = true
    const said = JSON.stringify(await projectsOf(await confirmed(fix.app, session)))
    expect(said).not.toContain('killed mid-move')
    expect(said).not.toContain(ROOT)
  })

  it('leaves that copy complete and correctly laid out, so the rename it names would publish it', async () => {
    const { fix, files } = await onDisk()
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(N1, [NT1, NT2]))
    files.killMove = true
    expect((await confirmed(fix.app, session)).status).toBe(200)
    files.killMove = false
    await files.move(buildDir(ROOT, 'microtask', N1), projectDir(ROOT, 'microtask', N1))
    const live = await fix.deps.store.readManifest('microtask', N1)
    expect(live?.tasks.map((one) => one.id)).toEqual([NT1, NT2])
    for (const id of [NT1, NT2]) {
      expect([id, await fix.deps.store.readTask('microtask', N1, id)]).not.toEqual([id, null])
    }
  })
})

describe('a clear that died is told apart from a build that died, the live project differing', () => {
  const reasonOf = async (response: Response): Promise<string> =>
    String(((await projectsOf(response))[0]?.['reasons'] as readonly string[])[0])

  const halfCleared = async (): Promise<{ fix: Fixture; files: Publishing }> => {
    const { fix, files } = await onDisk()
    await fix.deps.store.publishProject('microtask', dropped(IDS.p1, [IDS.t1, IDS.t2]))
    const session = await opened(fix.app)
    await stageProject(fix.app, session, dropped(IDS.p1, [IDS.t1]))
    files.killClear = (dir) => dir === projectDir(ROOT, 'microtask', IDS.p1)
    return { fix, files }
  }

  const applied = async (fix: Fixture): Promise<Response> => {
    const [session] = await sessionIds(fix)
    return confirmed(fix.app, String(session), [{ projectId: IDS.p1, choice: 'replace' }])
  }

  it('reports it failed, rm -rf being no more atomic than the loop it replaces', async () => {
    const { fix } = await halfCleared()
    expect(await outcomesOf(await applied(fix))).toEqual([[IDS.p1, 'failed']])
  })

  it('says the live project may be partly removed rather than claiming it is untouched', async () => {
    const { fix } = await halfCleared()
    const why = await reasonOf(await applied(fix))
    expect(why).toContain('may be partly removed')
    expect(why).toContain(`projects/${IDS.p1}/`)
    expect(why).not.toContain('is untouched')
  })

  it('instructs no rename, the destination one would rename onto being what just failed', async () => {
    const { fix } = await halfCleared()
    const why = await reasonOf(await applied(fix))
    expect(why).not.toContain('rename')
    expect(why).not.toContain('build/')
  })

  it('keeps the platform’s own rejection out of the row here too', async () => {
    const { fix } = await halfCleared()
    const said = JSON.stringify(await projectsOf(await applied(fix)))
    expect(said).not.toContain('killed mid-clear')
    expect(said).not.toContain(ROOT)
  })

  it('reads differently from a build that died, which is the distinction being drawn', async () => {
    const { fix } = await halfCleared()
    const clearing = await reasonOf(await applied(fix))
    const second = await onDisk()
    await second.fix.deps.store.publishProject('microtask', dropped(IDS.p1, [IDS.t1, IDS.t2]))
    const session = await opened(second.fix.app)
    await stageProject(second.fix.app, session, dropped(IDS.p1, [IDS.t1]))
    second.files.killBuildWrite = true
    const building = await reasonOf(
      await confirmed(second.fix.app, session, [{ projectId: IDS.p1, choice: 'replace' }]),
    )
    expect(building).toContain('is untouched')
    expect(clearing).not.toBe(building)
  })
})
