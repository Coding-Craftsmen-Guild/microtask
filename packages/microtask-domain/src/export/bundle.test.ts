import { describe, expect, it } from 'vitest'
import * as contracts from '@repo/contracts'
import { Conflict, NotFound, type IdGenerator } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { ProjectManifest } from '../entities/manifest.js'
import { convertBundledProject } from '../import/legacy.js'
import type { ProjectStore } from '../ports/project-store.js'
import type { ServiceContext } from '../services/context.js'
import { ShareIndex } from '@repo/kernel'
import { fixedClock } from '../testing/doubles.js'
import { folder, manifest, marked, shareLink, taskDocument, taskEntry, token } from '../testing/fixtures.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { bundleProject, bundleWorkspace, type ExportedBundle } from './bundle.js'

type Parsed<Schema extends { parse: (input: unknown) => unknown }> = ReturnType<Schema['parse']>

type Immutable<T> = T extends readonly (infer Element)[]
  ? readonly Immutable<Element>[]
  : T extends object
    ? { readonly [K in keyof T]: Immutable<T[K]> }
    : T

type MatchesContract<Entity extends Immutable<Output>, Output> = Entity

type Checked = readonly [MatchesContract<ExportedBundle, Parsed<typeof contracts.ExportBundle>>]

const P1 = marked('01P', 1)
const P2 = marked('01P', 2)
const T1 = marked('01T', 1)
const T2 = marked('01T', 2)
const B1 = marked('01B', 1)
const B2 = marked('01B', 2)
const F1 = marked('01F', 1)
const ABSENT = marked('01P', 9)

const VIEW_SEAT = token(1)
const MANAGE_SEAT = token(2)
const OTHER_SEAT = token(3)

const NEWER = '2026-06-02T00:00:00.000Z'
const OLDER = '2026-06-01T00:00:00.000Z'
const NOW = '2026-09-12T12:00:00.000Z'
const LATER = '2026-09-12T13:00:00.000Z'

const BUNDLE_MARK = '01BND'

const projectOne = (): ProjectManifest =>
  manifest(P1, {
    folders: [folder(F1, 'Inbox')],
    tasks: [
      taskEntry(T1, 'Write the spec', { folderId: F1 }),
      taskEntry(T2, 'Ship it', { position: 1 }),
    ],
    shareLinks: [
      shareLink(VIEW_SEAT, P1, { name: 'Sam at ACME' }),
      shareLink(MANAGE_SEAT, P1, { name: 'Ops', role: 'manage' }),
    ],
    updatedAt: NEWER,
  })

const projectTwo = (): ProjectManifest =>
  manifest(P2, {
    name: 'Other',
    shareLinks: [shareLink(OTHER_SEAT, P2, { role: 'manage' })],
    updatedAt: OLDER,
  })

const bundleIds = (): IdGenerator => {
  let minted = 0
  let handed = 0
  return {
    entityId: () => {
      minted += 1
      return marked(BUNDLE_MARK, minted)
    },
    token: () => {
      handed += 1
      return token(handed)
    },
  }
}

const counting = (
  inner: MemoryProjectStore,
): { store: ProjectStore; peak: () => number; reads: () => number } => {
  let live = 0
  let peak = 0
  let reads = 0
  const store: ProjectStore = {
    listManifests: (product) => inner.listManifests(product),
    readManifest: (product, projectId) => inner.readManifest(product, projectId),
    readTask: async (product, projectId, taskId) => {
      live += 1
      reads += 1
      peak = Math.max(peak, live)
      try {
        return await inner.readTask(product, projectId, taskId)
      } finally {
        live -= 1
      }
    },
    saveManifest: (product, project) => inner.saveManifest(product, project),
    saveTask: (product, project, task) => inner.saveTask(product, project, task),
    deleteTask: (product, project, taskId) => inner.deleteTask(product, project, taskId),
    publishProject: (product, project) => inner.publishProject(product, project),
    deleteProject: (product, projectId) => inner.deleteProject(product, projectId),
  }
  return { store, peak: () => peak, reads: () => reads }
}

const contextOver = (
  store: ProjectStore,
  at = NOW,
  ids: IdGenerator = bundleIds(),
): ServiceContext => ({
  store,
  tokens: new ShareIndex(),
  lock: new QueueLock(),
  clock: fixedClock(at),
  ids,
})

const seeded = async (): Promise<MemoryProjectStore> => {
  const store = new MemoryProjectStore()
  const one = projectOne()
  await store.saveTask('microtask', one, taskDocument(T1, B1))
  await store.saveTask('microtask', one, taskDocument(T2, B2))
  await store.saveManifest('microtask', projectTwo())
  return store
}

const exported = async (tokens: 'strip' | 'preserve'): Promise<ExportedBundle> =>
  bundleWorkspace(contextOver(await seeded()), 'microtask', tokens)

const refused = async (run: () => Promise<unknown>): Promise<Error> => {
  try {
    await run()
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error('the export succeeded, so there is no refusal to inspect')
}

const withEntryButNoDocument = async (): Promise<MemoryProjectStore> => {
  const store = new MemoryProjectStore()
  await store.saveManifest('microtask', manifest(P1, { tasks: [taskEntry(T1, 'Write the spec')] }))
  return store
}

const withTwoUnreadable = async (): Promise<MemoryProjectStore> => {
  const store = new MemoryProjectStore()
  const tasks = [taskEntry(T1, 'Write the spec'), taskEntry(T2, 'Ship it', { position: 1 })]
  await store.saveManifest('microtask', manifest(P1, { tasks }))
  return store
}

const WIDE = [3, 2, 1] as const

const wideProject = (index: number, tasks: number): ProjectManifest =>
  manifest(marked('01W', index), {
    tasks: Array.from({ length: tasks }, (_unused, at) =>
      taskEntry(marked(`01W${index}T`, at + 1), `Task ${at + 1}`, { position: at }),
    ),
    updatedAt: `2026-06-0${index}T00:00:00.000Z`,
  })

const seededWide = async (): Promise<MemoryProjectStore> => {
  const store = new MemoryProjectStore()
  let tabs = 0
  for (const [at, count] of WIDE.entries()) {
    const project = wideProject(at + 1, count)
    for (const entry of project.tasks) {
      tabs += 1
      await store.saveTask('microtask', project, taskDocument(entry.id, marked('01WB', tabs)))
    }
  }
  return store
}

const withUndecodableDocument = async (): Promise<MemoryProjectStore> => {
  const store = await withEntryButNoDocument()
  store.putRawTask('microtask', P1, T1, '{ "id": "not json"')
  return store
}

const importInto = async (
  store: MemoryProjectStore,
  bundle: ExportedBundle,
): Promise<MemoryProjectStore> => {
  for (const project of bundle.projects) {
    const { manifest: incoming, documents } = convertBundledProject(project)
    if (documents.length === 0) await store.saveManifest('microtask', incoming)
    for (const document of documents) await store.saveTask('microtask', incoming, document)
  }
  return store
}

const comparable = (bundle: ExportedBundle): unknown => ({
  ...bundle,
  bundleId: '<minted>',
  exportedAt: '<stamped>',
})

describe('an exported bundle is the shape @repo/contracts declares', () => {
  it('keeps the stated interface assignable to the output of the schema the route serves', () => {
    const proof: Checked | null = null
    expect(proof).toBeNull()
  })

  it('parses against ExportBundle, which the type check alone cannot prove of a refinement', async () => {
    const parsed = contracts.ExportBundle.safeParse(await exported('preserve'))
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('parses stripped as well, shareLinks being required and an empty block satisfying it', async () => {
    const parsed = contracts.ExportBundle.safeParse(await exported('strip'))
    expect(parsed.error?.issues ?? []).toEqual([])
  })

  it('has every key of every project described by ExportedProject, which is what import reads', async () => {
    for (const project of (await exported('preserve')).projects) {
      const parsed = contracts.ExportedProject.safeParse(project)
      expect(parsed.error?.issues ?? []).toEqual([])
      expect(Object.keys(parsed.data ?? {}).sort()).toEqual(Object.keys(project).sort())
    }
  })

  it('carries the discriminator this repo reads, so classification recognises its own export', async () => {
    const bundle = await exported('strip')
    expect([bundle.format, bundle.version]).toEqual([contracts.BUNDLE_FORMAT, contracts.BUNDLE_VERSION])
  })
})

describe('bundleWorkspace carries every project, newest update first', () => {
  it('lists the projects in the order the store lists them, which distinct stamps make total', async () => {
    expect((await exported('preserve')).projects.map((one) => one.id)).toEqual([P1, P2])
  })

  it('carries one document per manifest entry, in entry order', async () => {
    const [one] = (await exported('preserve')).projects
    expect(one?.taskDocuments.map((document) => document.id)).toEqual([T1, T2])
  })

  it('carries an empty document list for a project holding no tasks', async () => {
    const [, two] = (await exported('preserve')).projects
    expect(two?.taskDocuments).toEqual([])
  })
})

describe('bundleId and exportedAt come from the injected generator and clock', () => {
  it('mints the id through ctx.ids rather than calling ulid() itself', async () => {
    expect((await exported('strip')).bundleId).toBe(marked(BUNDLE_MARK, 1))
  })

  it('mints a fresh id per export, so "have I imported this?" is answerable', async () => {
    const ctx = contextOver(await seeded())
    const first = await bundleWorkspace(ctx, 'microtask', 'strip')
    const second = await bundleWorkspace(ctx, 'microtask', 'strip')
    expect([first.bundleId, second.bundleId]).toEqual([marked(BUNDLE_MARK, 1), marked(BUNDLE_MARK, 2)])
  })

  it('stamps from ctx.clock rather than copying a manifest stamp or reading the wall clock', async () => {
    const ctx = contextOver(await seeded(), LATER)
    const bundle = await bundleWorkspace(ctx, 'microtask', 'strip')
    expect(bundle.exportedAt).toBe(LATER)
    expect(bundle.projects.map((one) => one.updatedAt)).toEqual([NEWER, OLDER])
  })
})

describe('tokens=preserve carries each seat exactly as the store holds it', () => {
  it('answers every field of every link, by value', async () => {
    const bundle = await exported('preserve')
    expect(bundle.projects.map((one) => one.shareLinks)).toEqual([
      projectOne().shareLinks,
      projectTwo().shareLinks,
    ])
  })

  it('keeps the tokens themselves, which is the whole reason an import can be a migration', async () => {
    const bundle = await exported('preserve')
    expect(JSON.stringify(bundle)).toContain(VIEW_SEAT)
    expect(JSON.stringify(bundle)).toContain(MANAGE_SEAT)
    expect(JSON.stringify(bundle)).toContain(OTHER_SEAT)
  })
})

describe('tokens=strip omits the links entirely rather than blanking them', () => {
  it('carries an empty array, not a link with an empty token', async () => {
    expect((await exported('strip')).projects.map((one) => one.shareLinks)).toEqual([[], []])
  })

  it('leaves no token substring anywhere in the serialised bundle', async () => {
    const text = JSON.stringify(await exported('strip'))
    for (const seat of [VIEW_SEAT, MANAGE_SEAT, OTHER_SEAT]) expect(text).not.toContain(seat)
  })

  it('changes nothing else, so stripped and preserved differ only in the links', async () => {
    const stripped = await exported('strip')
    const preserved = await exported('preserve')
    const blanked = preserved.projects.map((one) => ({ ...one, shareLinks: [] }))
    expect(stripped.projects).toEqual(blanked)
  })
})

describe('a manifest entry whose task file will not read is a conflict, not a 404', () => {
  it('refuses an absent document, naming the project and the task', async () => {
    const ctx = contextOver(await withEntryButNoDocument())
    const error = await refused(() => bundleWorkspace(ctx, 'microtask', 'strip'))
    expect(error).toBeInstanceOf(Conflict)
    expect(error.message).toContain(P1)
    expect(error.message).toContain(T1)
  })

  it('names the first unreadable entry in manifest order, not whichever read lost the race', async () => {
    const ctx = contextOver(await withTwoUnreadable())
    const error = await refused(() => bundleWorkspace(ctx, 'microtask', 'strip'))
    expect(error.message).toContain(T1)
    expect(error.message).not.toContain(T2)
  })

  it('refuses a document that will not decode, which readTask reports the same way', async () => {
    const ctx = contextOver(await withUndecodableDocument())
    const error = await refused(() => bundleWorkspace(ctx, 'microtask', 'strip'))
    expect(error).toBeInstanceOf(Conflict)
    expect(error).not.toBeInstanceOf(NotFound)
  })

  it('refuses the same state on one project, rather than exporting a bundle that skips it', async () => {
    const ctx = contextOver(await withUndecodableDocument())
    const at = { product: 'microtask', projectId: P1 } as const
    expect(await refused(() => bundleProject(ctx, at, 'strip'))).toBeInstanceOf(Conflict)
  })

  it('keeps a project id naming nothing a NotFound, which an operator acts on differently', async () => {
    const ctx = contextOver(await seeded())
    const at = { product: 'microtask', projectId: ABSENT } as const
    expect(await refused(() => bundleProject(ctx, at, 'strip'))).toBeInstanceOf(NotFound)
  })
})

describe('bundleProject carries the one project addressed', () => {
  it('answers that project alone, with its documents and its links', async () => {
    const ctx = contextOver(await seeded())
    const at = { product: 'microtask', projectId: P1 } as const
    const bundle = await bundleProject(ctx, at, 'preserve')
    expect(bundle.projects.map((one) => one.id)).toEqual([P1])
    expect(bundle.projects[0]?.shareLinks).toEqual(projectOne().shareLinks)
  })
})

describe('export, import into an empty store, export again', () => {
  it('is an identity on the conversion leg, the cache agreeing with the documents it carries', async () => {
    for (const project of (await exported('preserve')).projects) {
      const { taskDocuments, ...rest } = project
      expect(convertBundledProject(project)).toEqual({ manifest: rest, documents: taskDocuments })
    }
  })

  it('round-trips to the same bundle apart from its id and its stamp', async () => {
    const ids = bundleIds()
    const first = await bundleWorkspace(contextOver(await seeded(), NOW, ids), 'microtask', 'preserve')
    const restored = await importInto(new MemoryProjectStore(), first)
    const second = await bundleWorkspace(contextOver(restored, LATER, ids), 'microtask', 'preserve')
    expect(comparable(second)).toEqual(comparable(first))
    expect(second.bundleId).not.toBe(first.bundleId)
    expect(second.exportedAt).not.toBe(first.exportedAt)
  })

  it('mints the second id rather than carrying the first one back through the store', async () => {
    const ids = bundleIds()
    const first = await bundleWorkspace(contextOver(await seeded(), NOW, ids), 'microtask', 'preserve')
    const restored = await importInto(new MemoryProjectStore(), first)
    const second = await bundleWorkspace(contextOver(restored, LATER, ids), 'microtask', 'preserve')
    expect([first.bundleId, second.bundleId]).toEqual([
      marked(BUNDLE_MARK, 1),
      marked(BUNDLE_MARK, 2),
    ])
  })

  it('writes the tokens themselves back to the store, in the order the bundle carried them', async () => {
    const first = await bundleWorkspace(contextOver(await seeded()), 'microtask', 'preserve')
    const restored = await importInto(new MemoryProjectStore(), first)
    const found = await restored.readManifest('microtask', P1)
    expect(found?.shareLinks.map((one) => one.token)).toEqual([VIEW_SEAT, MANAGE_SEAT])
  })
})

describe('the fan-out is per project, a Promise.all over both levels having died with EMFILE', () => {
  it('never has more task reads in flight than the largest project holds tasks', async () => {
    const counted = counting(await seededWide())
    await bundleWorkspace(contextOver(counted.store), 'microtask', 'strip')
    expect(counted.reads()).toBe(6)
    expect(counted.peak()).toBe(3)
  })

  it('still reads one project’s tasks together, the bound being per project and not per task', async () => {
    const counted = counting(await seededWide())
    const at = { product: 'microtask', projectId: marked('01W', 1) } as const
    await bundleProject(contextOver(counted.store), at, 'strip')
    expect([counted.reads(), counted.peak()]).toEqual([3, 3])
  })
})
