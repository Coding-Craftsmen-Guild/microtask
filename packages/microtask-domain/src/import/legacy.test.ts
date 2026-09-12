import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as contracts from '@repo/contracts'
import { Invalid, isUlid } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import { emptyDocument, type DocumentJson } from '../entities/document.js'
import type { TaskDocument } from '../entities/task.js'
import { taskCache } from '../services/task-cache.js'
import { SearchService } from '../services/search-service.js'
import { ShareIndex } from '../storage/share-index.js'
import { taskFile } from '../storage/paths.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { folder, manifest, taskDocument, taskEntry, STAMP } from '../testing/fixtures.js'
import { MemoryProjectStore } from '../testing/memory-project-store.js'
import { convertBundledProject, convertLegacyProject, type BundledProject } from './legacy.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T1 = '01M25000000000000000000001'
const T2 = '01M25000000000000000000002'
const TAB1 = '01M25000000000000000000003'

const TAB_STAMP = '2026-09-11T00:00:00.000Z'
const NOW = '2026-09-12T12:00:00.000Z'
const TOKEN = 'yjKq3Zc1vHt8Lm0Pw5Rb2Nd7'
const OTHER_TOKEN = 'Zm9vYmFyYmF6cXV1eHF1dXg'

/**
 * The two projects `data/projects/` actually holds, mechanically neutralised by
 * `packages/contracts/scripts/derive-legacy-fixture.mjs`.
 *
 * Reached by relative path because `@repo/contracts` publishes only `"."`, the way Task 2's
 * sniff test and contracts' own `document-facts.test.ts` reach them. That second test is what
 * binds these files to production: where `data/` exists it asserts every structural fact of the
 * real project against the fixture derived from it, so a conversion asserted here is asserted
 * against the shape the volume holds — and it still runs where `data/` does not, which is every
 * CI runner and every container build (ADR 0026).
 *
 * Both are exercised, because one sample cannot be mistaken for the shape: the first carries four
 * tabs and two share links, one of them with no name at all, and the second carries one tab and
 * an empty `shareLinks`.
 */
const FIXTURES = [
  new URL('../../../contracts/src/testing/legacy-project.fixture.json', import.meta.url),
  new URL('../../../contracts/src/testing/legacy-project-2.fixture.json', import.meta.url),
] as const

interface StoredTab {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly document: unknown
}

interface StoredProject {
  readonly id: string
  readonly tabs: readonly StoredTab[]
  readonly shareLinks: readonly Record<string, unknown>[]
}

const derived = (fixture: URL): StoredProject =>
  JSON.parse(readFileSync(fixture, 'utf8')) as StoredProject

const each = FIXTURES.map((fixture, index) => [index, fixture] as const)

const convert = (json: unknown) => convertLegacyProject(json, fixedClock(NOW), sequentialIds())

const legacyTab = (id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name: 'Go-live',
  position: 0,
  document: emptyDocument(),
  createdAt: STAMP,
  updatedAt: TAB_STAMP,
  ...overrides,
})

const legacyProject = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: P1,
  name: 'ACME Website',
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: [legacyTab(T1)],
  shareLinks: [],
  ...overrides,
})

const linkFrom = (link: Record<string, unknown>) =>
  convert(legacyProject({ shareLinks: [link] })).manifest.shareLinks[0]

const checklist = (states: readonly boolean[]): DocumentJson => ({
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: states.map((checked) => ({
        type: 'taskItem',
        attrs: { checked },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ship it' }] }],
      })),
    },
  ],
})

const bundled = (overrides: Partial<BundledProject> = {}): BundledProject => ({
  ...manifest(P1),
  taskDocuments: [],
  ...overrides,
})

const counted: TaskDocument = {
  id: T1,
  createdAt: STAMP,
  updatedAt: TAB_STAMP,
  tabs: [
    {
      id: TAB1,
      name: 'Checklist',
      position: 0,
      document: checklist([false, false]),
      createdAt: STAMP,
      updatedAt: TAB_STAMP,
    },
  ],
}

describe('convertLegacyProject maps a legacy project onto design §7.6', () => {
  it('turns each legacy tab into one task holding that document in a single tab named General', () => {
    const body = checklist([true, false])
    const converted = convert(legacyProject({ tabs: [legacyTab(T1, { document: body })] }))
    expect(converted.documents).toHaveLength(1)
    const document = converted.documents[0]
    expect(document?.tabs).toHaveLength(1)
    expect(document?.tabs[0]?.name).toBe('General')
    expect(document?.tabs[0]?.position).toBe(0)
    expect(document?.tabs[0]?.document).toEqual(body)
  })

  it('names every imported task after the legacy tab it came from, in source order', () => {
    const tabs = [legacyTab(T1, { name: 'Go-live' }), legacyTab(T2, { name: 'Content review' })]
    const converted = convert(legacyProject({ tabs }))
    expect(converted.manifest.tasks.map((task) => task.name)).toEqual(['Go-live', 'Content review'])
  })

  it('does not name the tasks General, which would hide every imported task from search', () => {
    const converted = convert(legacyProject({ tabs: [legacyTab(T1, { name: 'Go-live' })] }))
    expect(converted.manifest.tasks[0]?.name).not.toBe('General')
  })

  it('keeps each legacy tab position verbatim rather than renumbering it into array order', () => {
    const tabs = [
      legacyTab(T1, { name: 'Fifth', position: 5 }),
      legacyTab(T2, { name: 'Second', position: 2 }),
    ]
    const converted = convert(legacyProject({ tabs }))
    expect(converted.manifest.tasks.map((task) => task.position)).toEqual([5, 2])
    expect(converted.manifest.tasks.map((task) => task.name)).toEqual(['Fifth', 'Second'])
  })

  it('files every imported task at the project root, because legacy has no folders', () => {
    const converted = convert(legacyProject({ tabs: [legacyTab(T1), legacyTab(T2)] }))
    expect(converted.manifest.folders).toEqual([])
    expect(converted.manifest.tasks.map((task) => task.folderId)).toEqual([null, null])
  })

  it('preserves the project id and both project stamps', () => {
    const converted = convert(legacyProject({ createdAt: STAMP, updatedAt: TAB_STAMP }))
    expect(converted.manifest.id).toBe(P1)
    expect(converted.manifest.createdAt).toBe(STAMP)
    expect(converted.manifest.updatedAt).toBe(TAB_STAMP)
  })

  it('takes the import clock for a project stamp a hand-edited file left out', () => {
    const converted = convert({ id: P1, name: 'ACME', tabs: [], shareLinks: [] })
    expect(converted.manifest.createdAt).toBe(NOW)
    expect(converted.manifest.updatedAt).toBe(NOW)
  })

  it('takes the import clock for a stamp that is not a string, rather than stringifying it', () => {
    const tabs = [legacyTab(T1, { createdAt: 12345, updatedAt: null })]
    const converted = convert(legacyProject({ updatedAt: 12345, tabs }))
    expect(converted.manifest.updatedAt).toBe(NOW)
    expect(converted.documents[0]?.createdAt).toBe(NOW)
    expect(converted.documents[0]?.tabs[0]?.updatedAt).toBe(NOW)
    expect(contracts.ProjectManifest.safeParse(converted.manifest).error?.issues ?? []).toEqual([])
  })
})

describe('convertLegacyProject preserves ids', () => {
  it('takes the old tab id as the task id, for the task and its document alike', () => {
    const converted = convert(legacyProject({ tabs: [legacyTab(T1), legacyTab(T2)] }))
    expect(converted.manifest.tasks.map((task) => task.id)).toEqual([T1, T2])
    expect(converted.documents.map((document) => document.id)).toEqual([T1, T2])
  })

  it('produces task ids that are ULIDs, which is what a task file can be named for', () => {
    for (const [, fixture] of each) {
      const converted = convert(derived(fixture))
      expect(converted.manifest.tasks).not.toHaveLength(0)
      for (const task of converted.manifest.tasks) expect(isUlid(task.id)).toBe(true)
    }
  })

  it('carries a tab id that is no ULID through, so the preview refuses it and not the write', () => {
    const converted = convert(legacyProject({ tabs: [legacyTab('../etc/passwd')] }))
    expect(converted.manifest.tasks[0]?.id).toBe('../etc/passwd')
    expect(contracts.ProjectManifest.safeParse(converted.manifest).success).toBe(false)
    expect(() => taskFile('/data', 'microtask', P1, '../etc/passwd')).toThrow(Invalid)
  })

  it('copes with a non-string id and name rather than throwing, since the preview refuses them', () => {
    const converted = convert(legacyProject({ id: 42, name: { evil: true } }))
    expect(converted.manifest.id).toBe('42')
    expect(contracts.ProjectManifest.safeParse(converted.manifest).success).toBe(false)
  })

  it('gives the inner tab the exact next id of the injected generator, minting nothing itself', () => {
    const twin = sequentialIds()
    const want = [twin.entityId(), twin.entityId()]
    const converted = convert(legacyProject({ tabs: [legacyTab(T1), legacyTab(T2)] }))
    const ids = converted.documents.flatMap((document) => document.tabs.map((tab) => tab.id))
    expect(ids).toEqual(want)
    for (const id of ids) expect(isUlid(id)).toBe(true)
  })
})

describe('convertLegacyProject describes a broken file rather than refusing to read it', () => {
  it.each([[null], ['nope'], [42], [[1, 2]]])('reads %o into a manifest the preview refuses', (json) => {
    const converted = convertLegacyProject(json, fixedClock(NOW), sequentialIds())
    expect(converted.documents).toEqual([])
    expect(contracts.ProjectManifest.safeParse(converted.manifest).success).toBe(false)
  })

  it('gives a tab that is not an object a row of its own, rather than dropping it silently', () => {
    const converted = convert(legacyProject({ tabs: ['nope', legacyTab(T1)] }))
    expect(converted.manifest.tasks).toHaveLength(2)
    expect(converted.documents).toHaveLength(2)
    expect(contracts.ProjectManifest.safeParse(converted.manifest).success).toBe(false)
  })

  it('reports a position that is not a number rather than inventing one', () => {
    const converted = convert(legacyProject({ tabs: [legacyTab(T1, { position: '3' })] }))
    const parsed = contracts.ProjectManifest.safeParse(converted.manifest)
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toContain('tasks.0.position')
  })
})

describe('convertLegacyProject maps share links', () => {
  it('maps read to view and write to write, which is the §7.6 permission mapping', () => {
    expect(linkFrom({ token: TOKEN, name: 'Sam', permission: 'read' })?.role).toBe('view')
    expect(linkFrom({ token: TOKEN, name: 'Sam', permission: 'write' })?.role).toBe('write')
  })

  it('maps a link with no permission to write, because the oldest links are write-capable', () => {
    expect(linkFrom({ token: TOKEN, name: 'Sam', createdAt: STAMP })?.role).toBe('write')
  })

  it('maps a permission outside the two legacy words to write, which is the real rule', () => {
    expect(linkFrom({ token: TOKEN, permission: 'admin' })?.role).toBe('write')
    expect(linkFrom({ token: TOKEN, permission: 'view' })?.role).toBe('write')
    expect(linkFrom({ token: TOKEN, permission: null })?.role).toBe('write')
  })

  it('takes a label as the name when a link carries no name, which older links did', () => {
    const link = linkFrom({ token: TOKEN, label: 'Jane at ACME', createdAt: STAMP })
    expect(link?.name).toBe('Jane at ACME')
  })

  it('prefers a name over a label when a link carries both', () => {
    expect(linkFrom({ token: TOKEN, name: 'Sam', label: 'Jane' })?.name).toBe('Sam')
  })

  it('accepts a link with no name at all, because import is not minting (ADR 0042)', () => {
    const link = linkFrom({ token: TOKEN, createdAt: STAMP })
    expect(link?.name).toBe('')
    expect(contracts.ShareLink.safeParse(link).error?.issues ?? []).toEqual([])
  })

  it('takes the import clock for a link with no createdAt, and for a blank one', () => {
    expect(linkFrom({ token: TOKEN, name: 'Sam' })?.createdAt).toBe(NOW)
    expect(linkFrom({ token: TOKEN, name: 'Sam', createdAt: '' })?.createdAt).toBe(NOW)
    expect(linkFrom({ token: TOKEN, name: 'Sam', createdAt: STAMP })?.createdAt).toBe(STAMP)
  })

  it('preserves every token and scopes every link to the project it arrived with', () => {
    const links = [
      { token: TOKEN, name: 'Sam', permission: 'read', createdAt: STAMP },
      { token: OTHER_TOKEN, name: '', permission: 'write', createdAt: STAMP },
    ]
    const converted = convert(legacyProject({ shareLinks: links }))
    expect(converted.manifest.shareLinks.map((link) => link.token)).toEqual([TOKEN, OTHER_TOKEN])
    for (const link of converted.manifest.shareLinks) {
      expect(link.scope).toEqual({ kind: 'project', projectId: P1 })
      expect(link.createdBy).toBeNull()
    }
  })

  it('bounds an over-long link name, which nothing downstream would accept', () => {
    const link = linkFrom({ token: TOKEN, name: 'x'.repeat(200) })
    expect(link?.name).toHaveLength(contracts.LIMITS.nameLength)
    expect(contracts.ShareLink.safeParse(link).error?.issues ?? []).toEqual([])
  })
})

describe('convertLegacyProject normalises the names the contracts will not accept', () => {
  it('produces a manifest and a task document that parse clean from names that would not', () => {
    const tabs = [legacyTab(T1, { name: '' }), legacyTab(T2, { name: 'x'.repeat(200) })]
    const converted = convert(legacyProject({ name: '   ', tabs }))
    expect(contracts.ProjectManifest.safeParse(converted.manifest).error?.issues ?? []).toEqual([])
    for (const document of converted.documents) {
      expect(contracts.TaskDocument.safeParse(document).error?.issues ?? []).toEqual([])
    }
    expect(converted.manifest.name).not.toBe('')
    expect(converted.manifest.tasks[0]?.name).not.toBe('')
    expect(converted.manifest.tasks[1]?.name).toHaveLength(contracts.LIMITS.nameLength)
  })
})

describe('convertLegacyProject caches every manifest entry from its document', () => {
  it('writes all four cache fields from taskCache, not the three that are easy', () => {
    const body = checklist([true, false, false])
    const converted = convert(legacyProject({ tabs: [legacyTab(T1, { document: body })] }))
    const document = converted.documents[0] as TaskDocument
    const cached = taskCache(document)
    expect(converted.manifest.tasks[0]).toMatchObject({
      progress: cached.progress,
      updatedAt: cached.updatedAt,
      tabCount: cached.tabCount,
      tabNames: cached.tabNames,
    })
    expect(cached.progress).toEqual({ done: 1, total: 3 })
    expect(cached.tabNames).toEqual(['General'])
  })

  it('stamps each entry with its own task document, never with the project stamp', () => {
    const converted = convert(legacyProject({ updatedAt: STAMP, tabs: [legacyTab(T1)] }))
    expect(converted.manifest.tasks[0]?.updatedAt).toBe(TAB_STAMP)
    expect(converted.manifest.tasks[0]?.updatedAt).not.toBe(converted.manifest.updatedAt)
  })
})

describe('convertBundledProject recomputes what a bundle only asserts', () => {
  it('names the same shape a bundle carries, so a field cannot drift out of the pair', () => {
    const source = bundled({
      taskDocuments: [taskDocument(T1, TAB1)],
      tasks: [taskEntry(T1, 'Go-live')],
    })
    expect(contracts.ExportedProject.safeParse(source).error?.issues ?? []).toEqual([])
  })

  it('trusts none of the four cache fields a bundle carries', () => {
    const lying = taskEntry(T1, 'Go-live', {
      progress: { done: 99, total: 99 },
      updatedAt: STAMP,
      tabCount: 41,
      tabNames: ['Nine', 'Ten'],
    })
    const converted = convertBundledProject(bundled({ tasks: [lying], taskDocuments: [counted] }))
    expect(converted.manifest.tasks[0]).toMatchObject({
      progress: { done: 0, total: 2 },
      updatedAt: TAB_STAMP,
      tabCount: 1,
      tabNames: ['Checklist'],
    })
  })

  it('keeps the entry fields a bundle owns, since only the cache is derivable', () => {
    const entry = taskEntry(T1, 'Go-live', { position: 3, tabCount: 41 })
    const converted = convertBundledProject(bundled({ tasks: [entry], taskDocuments: [counted] }))
    expect(converted.manifest.tasks[0]).toMatchObject({
      id: T1,
      name: 'Go-live',
      position: 3,
      folderId: null,
    })
    expect(converted.documents).toEqual([counted])
  })

  it('leaves an entry no document was carried for to the cross-check, having nothing to count', () => {
    const entry = taskEntry(T2, 'Orphan', { progress: { done: 4, total: 4 } })
    const converted = convertBundledProject(bundled({ tasks: [entry], taskDocuments: [] }))
    expect(converted.manifest.tasks[0]?.progress).toEqual({ done: 4, total: 4 })
  })

  it('produces a manifest that parses, from a bundle whose names would not', () => {
    const entry = taskEntry(T1, 'Go-live', { name: '' })
    const source = bundled({
      name: '  ',
      folders: [folder(TAB1, '')],
      tasks: [entry],
      taskDocuments: [counted],
    })
    const converted = convertBundledProject(source)
    expect(contracts.ProjectManifest.safeParse(converted.manifest).error?.issues ?? []).toEqual([])
  })

  it('cleans a blank tab name too, since the cache the manifest carries is derived from it', () => {
    const blank: TaskDocument = { ...counted, tabs: counted.tabs.map((tab) => ({ ...tab, name: '' })) }
    const source = bundled({ tasks: [taskEntry(T1, 'Go-live')], taskDocuments: [blank] })
    const converted = convertBundledProject(source)
    expect(converted.manifest.tasks[0]?.tabNames).toEqual(['General'])
    expect(contracts.ProjectManifest.safeParse(converted.manifest).error?.issues ?? []).toEqual([])
    for (const document of converted.documents) {
      expect(contracts.TaskDocument.safeParse(document).error?.issues ?? []).toEqual([])
    }
  })

  it('carries a bundled project id, stamps and share links through untouched', () => {
    const source = bundled({
      taskDocuments: [taskDocument(T1, TAB1)],
      tasks: [taskEntry(T1, 'Go-live')],
    })
    const converted = convertBundledProject(source)
    expect(converted.manifest.id).toBe(source.id)
    expect(converted.manifest.createdAt).toBe(source.createdAt)
    expect(converted.manifest.updatedAt).toBe(source.updatedAt)
    expect(converted.manifest.shareLinks).toEqual(source.shareLinks)
  })

  it("carries a bundled folder's id, position and stamps through, cleaning only its name", () => {
    const source = bundled({ folders: [folder(TAB1, '  Phase   one  ', { position: 7 })] })
    const kept = convertBundledProject(source).manifest.folders[0]
    expect(kept?.id).toBe(TAB1)
    expect(kept?.position).toBe(7)
    expect(kept?.createdAt).toBe(STAMP)
    expect(kept?.updatedAt).toBe(STAMP)
    expect(kept?.name).toBe('Phase one')
  })

  it('requires a manifest that has already been schema-checked, unlike the legacy path', () => {
    const unchecked = { id: P1, name: 'ACME Website', taskDocuments: [] }
    expect(() => convertBundledProject(unchecked as unknown as BundledProject)).toThrow(TypeError)
    expect(() => convert(unchecked)).not.toThrow()
  })

  it('requires every carried document to have been schema-checked too', () => {
    const source = { ...bundled({ tasks: [] }), taskDocuments: [{ id: T1 }] }
    expect(() => convertBundledProject(source as unknown as BundledProject)).toThrow(TypeError)
  })
})

describe('convertLegacyProject over the projects data/ actually holds', () => {
  it.each(each)('converts derived production project %i into shapes that parse', (_index, fixture) => {
    const source = derived(fixture)
    const converted = convert(source)
    expect(contracts.ProjectManifest.safeParse(converted.manifest).error?.issues ?? []).toEqual([])
    for (const document of converted.documents) {
      expect(contracts.TaskDocument.safeParse(document).error?.issues ?? []).toEqual([])
    }
    expect(converted.manifest.id).toBe(source.id)
    expect(converted.documents).toHaveLength(source.tabs.length)
    const tabs = source.tabs
    expect(converted.manifest.tasks.map((task) => task.id)).toEqual(tabs.map((tab) => tab.id))
    expect(converted.manifest.tasks.map((task) => task.position)).toEqual(
      tabs.map((tab) => tab.position),
    )
    expect(converted.manifest.tasks.map((task) => task.name)).toEqual(tabs.map((tab) => tab.name))
  })

  it.each(each)('preserves every token and permission of derived project %i', (_index, fixture) => {
    const source = derived(fixture)
    const converted = convert(source)
    expect(converted.manifest.shareLinks.map((link) => link.token)).toEqual(
      source.shareLinks.map((link) => link['token']),
    )
    expect(converted.manifest.shareLinks.map((link) => link.role)).toEqual(
      source.shareLinks.map((link) => (link['permission'] === 'read' ? 'view' : 'write')),
    )
  })

  it('keeps the nameless share link production already holds, rather than dropping the row', () => {
    const source = derived(FIXTURES[0])
    const nameless = source.shareLinks.filter((link) => link['name'] === '')
    expect(nameless).not.toHaveLength(0)
    const converted = convert(source)
    const kept = converted.manifest.shareLinks.filter((link) => link.name === '')
    expect(kept).toHaveLength(nameless.length)
  })

  it('carries every tab document through unchanged, since import copies rather than edits', () => {
    const source = derived(FIXTURES[0])
    const converted = convert(source)
    expect(converted.documents.map((document) => document.tabs[0]?.document)).toEqual(
      source.tabs.map((tab) => tab.document),
    )
  })
})

describe('an imported legacy project is findable', () => {
  it('finds an imported task by the name its legacy tab carried, which General would hide', async () => {
    const store = new MemoryProjectStore()
    const service = new SearchService({
      store,
      tokens: new ShareIndex(),
      lock: new QueueLock(),
      clock: fixedClock(NOW),
      ids: sequentialIds(),
    })
    const converted = convert(legacyProject({ tabs: [legacyTab(T1, { name: 'Zephyrine audit' })] }))
    await store.saveManifest('microtask', converted.manifest)
    const results = await service.search('microtask', { kind: 'admin' }, 'zephyrine')
    expect(results).toEqual([{ kind: 'task', projectId: P1, taskId: T1, name: 'Zephyrine audit' }])
  })
})
