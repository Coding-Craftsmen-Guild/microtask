import { describe, expect, it } from 'vitest'
import {
  LIMITS,
  MAX_PREVIEW_REASONS,
  MAX_PREVIEW_TEXT_LENGTH,
  ProjectList,
  ProjectView,
} from '@repo/contracts'
import { isShareToken, type Role } from '@repo/kernel'
import { emptyDocument, type DocumentJson } from '../entities/document.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import type { TokenIndex } from '../ports/token-index.js'
import { cleanName } from '../limits.js'
import { ShareIndex } from '../storage/share-index.js'
import { projectListItem, projectView } from '../views/project-view.js'
import { fixedClock, sequentialIds } from '../testing/doubles.js'
import { folder, manifest, STAMP, taskDocument, taskEntry } from '../testing/fixtures.js'
import { convertLegacyProject, type ConvertedProject } from './legacy.js'
import {
  checkImport,
  type CheckedProject,
  type DroppedProject,
  type ImportTarget,
} from './checks.js'

const NOW = '2026-09-12T12:00:00.000Z'

const marked = (mark: string, index: number): string =>
  `${mark}${String(index).padStart(26 - mark.length, '0')}`

const P1 = marked('01P', 1)
const P2 = marked('01P', 2)
const P3 = marked('01P', 3)
const T1 = marked('01T', 1)
const T2 = marked('01T', 2)
const F1 = marked('01F', 1)
const F2 = marked('01F', 2)
const F3 = marked('01F', 3)
const B1 = marked('01B', 1)
const B2 = marked('01B', 2)

const token = (index: number): string => `tok_${String(index).padStart(16, '0')}`

const TOKEN = token(1)
const OTHER = token(2)

const taskIds = (count: number, from = 1): readonly string[] =>
  Array.from({ length: count }, (_unused, index) => marked('01T', from + index))

const link = (value: string, overrides: Partial<ShareLink> = {}): ShareLink => ({
  token: value,
  name: 'Sam at ACME',
  role: 'view',
  scope: { kind: 'project', projectId: P1 },
  createdBy: null,
  createdAt: STAMP,
  ...overrides,
})

const tabAt = (id: string, position: number, document: DocumentJson = emptyDocument()): Tab => ({
  id,
  name: 'General',
  position,
  document,
  createdAt: STAMP,
  updatedAt: STAMP,
})

const documentOf = (id: string, tabs: readonly Tab[]): TaskDocument => ({
  id,
  tabs,
  createdAt: STAMP,
  updatedAt: STAMP,
})

const entriesFor = (ids: readonly string[]): readonly TaskEntry[] =>
  ids.map((id, index) => taskEntry(id, `Task ${String(index)}`))

const documentsFor = (ids: readonly string[]): readonly TaskDocument[] =>
  ids.map((id, index) => taskDocument(id, marked('01B', 100 + index)))

const project = (id: string, overrides: Partial<ProjectManifest> = {}): ProjectManifest =>
  manifest(id, overrides)

const directory = (
  raw: unknown,
  documents: readonly TaskDocument[],
  named?: readonly string[],
): DroppedProject => ({
  shape: 'v2',
  path: `volume/${P1}`,
  manifest: raw,
  documents: documents.map((document, index) => {
    const names = named?.[index] ?? document.id
    return { id: names, path: `volume/${P1}/tasks/${names}.json`, json: document }
  }),
})

const bundled = (raw: unknown, documents: readonly unknown[], at = 0): DroppedProject => ({
  shape: 'v2',
  path: `export.json projects[${String(at)}]`,
  manifest: raw,
  documents: documents.map((json, index) => ({
    id: null,
    path: `export.json projects[${String(at)}].taskDocuments[${String(index)}]`,
    json,
  })),
})

const legacyTab = (
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  id,
  name: 'Go-live',
  position: 0,
  document: emptyDocument(),
  createdAt: STAMP,
  updatedAt: STAMP,
  ...overrides,
})

const legacyJson = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: P1,
  name: 'ACME Website',
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: [legacyTab(T1), legacyTab(T2)],
  shareLinks: [],
  ...overrides,
})

const legacy = (overrides: Record<string, unknown> = {}): DroppedProject => ({
  shape: 'legacy',
  path: 'legacy.json',
  converted: convertLegacyProject(legacyJson(overrides), fixedClock(NOW), sequentialIds()),
})

const built = (value: ConvertedProject): DroppedProject => ({
  shape: 'legacy',
  path: 'hand-built.json',
  converted: value,
})

const target = (overrides: Partial<ImportTarget> = {}): ImportTarget => ({
  product: 'microtask',
  tokens: new ShareIndex(),
  projectIds: [],
  ...overrides,
})

const owning = (projectId: string, tokens: readonly string[]): TokenIndex => {
  const index = new ShareIndex()
  index.add('microtask', project(projectId, { shareLinks: tokens.map((value) => link(value)) }))
  return index
}

const only = (drop: DroppedProject, at: ImportTarget = target()): CheckedProject =>
  checkImport([drop], at)[0] as CheckedProject

const said = (checked: CheckedProject): string => checked.reasons.join(' ~ ')

const HOSTILE: DocumentJson = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          text: 'click',
        },
      ],
    },
  ],
}

describe('schema conformance, which runs before anything else', () => {
  it('blocks a manifest entry at a negative position, naming the project and the path', () => {
    const tasks = [taskEntry(T1, 'Fine'), { ...taskEntry(T2, 'Broken'), position: -1 }]
    const checked = only(directory(project(P1, { tasks }), documentsFor([T1, T2])))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain('tasks.1.position')
    expect(said(checked)).toContain(`volume/${P1}`)
    expect(checked.converted).toBeNull()
  })

  it('blocks a share link whose role is outside the enum, on the drop set and not on disk', () => {
    const shareLinks = [link(TOKEN), { ...link(OTHER), role: 'owner' as Role }]
    const checked = only(directory(project(P1, { shareLinks }), []))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain('shareLinks.1.role')
  })

  it('blocks a manifest with no shareLinks block, which ShareIndex.add would dereference', () => {
    const { shareLinks, ...broken } = project(P1)
    expect(shareLinks).toEqual([])
    const checked = only(directory(broken, []))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain('shareLinks')
    expect(() => new ShareIndex().add('microtask', broken as unknown as ProjectManifest)).toThrow()
  })

  it('runs before conversion, so a manifest nobody has checked never reaches the converter', () => {
    const unchecked = { id: P1, name: 'ACME Website' }
    expect(() => only(directory(unchecked, []))).not.toThrow()
    expect(only(directory(unchecked, [])).outcome).toBe('blocked')
    expect(only(directory(unchecked, [])).converted).toBeNull()
  })

  it('blocks a task document that is not one, naming the file it came from', () => {
    const broken = { id: T2, tabs: 'nope' } as unknown as TaskDocument
    const drop = directory(project(P1, { tasks: entriesFor([T1, T2]) }), [
      taskDocument(T1, B1),
      broken,
    ])
    const checked = only(drop)
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(`tasks/${T2}.json`)
    expect(said(checked)).toContain('tabs')
  })

  it('blocks a legacy position that is not a number, which serialises to null on disk', () => {
    const checked = only(legacy({ tabs: [legacyTab(T1), legacyTab(T2, { position: '3' })] }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain('tasks.1.position')
    expect(JSON.stringify({ position: Number.NaN })).toBe('{"position":null}')
  })

  it('lets a checked project read back through the two schemas the client parses it with', () => {
    const tasks = entriesFor([T1, T2])
    const shareLinks = [link(TOKEN), link(OTHER, { role: 'manage' })]
    const drop = directory(project(P1, { tasks, shareLinks }), documentsFor([T1, T2]))
    const checked = only(drop)
    expect(checked.outcome).toBe('importable')
    const stored = (checked.converted as ConvertedProject).manifest
    const view = projectView(stored, { kind: 'admin' })
    expect(ProjectView.safeParse(view).error?.issues ?? []).toEqual([])
    const list = { projects: [projectListItem(stored, { kind: 'admin' })] }
    expect(ProjectList.safeParse(list).error?.issues ?? []).toEqual([])
  })
})

describe('the manifest/file cross-check, which compares ids and not counts', () => {
  it('blocks nine manifest entries with eight task files, naming the id with no file', () => {
    const ids = taskIds(9)
    const drop = directory(project(P1, { tasks: entriesFor(ids) }), documentsFor(ids.slice(0, 8)))
    const checked = only(drop)
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(ids[8] as string)
  })

  it('blocks nine task files with a manifest naming eight, naming the id nothing names', () => {
    const ids = taskIds(9)
    const drop = directory(project(P1, { tasks: entriesFor(ids.slice(0, 8)) }), documentsFor(ids))
    const checked = only(drop)
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(ids[8] as string)
  })

  it('blocks nine entries and nine files whose ids do not correspond, which counts cannot see', () => {
    const named = taskIds(9)
    const carried = taskIds(9, 21)
    const raw = project(P1, { tasks: entriesFor(named) })
    const checked = only(directory(raw, documentsFor(carried)))
    expect(raw.tasks).toHaveLength(9)
    expect(documentsFor(carried)).toHaveLength(9)
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(named[0] as string)
    expect(said(checked)).toContain(carried[0] as string)
  })

  it('blocks a task file whose document names a different task, which the two sets agree on', () => {
    const raw = project(P1, { tasks: entriesFor([T1]) })
    const checked = only(directory(raw, [taskDocument(T2, B1)], [T1]))
    expect(checked.outcome).toBe('blocked')
    expect(checked.reasons).toContain(`A task file holds the document of task "${T2}"`)
    expect(said(checked)).not.toContain('no document for')
    expect(said(checked)).not.toContain('names no task for')
  })

  it('passes a bundle whose embedded documents pair with every entry it names', () => {
    const ids = taskIds(9)
    const drop = bundled(project(P1, { tasks: entriesFor(ids) }), documentsFor(ids))
    expect(only(drop).outcome).toBe('importable')
  })
})

describe('token uniqueness, in the drop set and against disk', () => {
  it('blocks both projects of one bundle when they share a token, naming the other project', () => {
    const first = bundled(project(P1, { shareLinks: [link(OTHER), link(TOKEN)] }), [], 0)
    const second = bundled(project(P2, { shareLinks: [link(token(3)), link(TOKEN)] }), [], 1)
    const checked = checkImport([first, second], target())
    expect(checked.map((one) => one.outcome)).toEqual(['blocked', 'blocked'])
    expect(said(checked[0] as CheckedProject)).toContain(P2)
    expect(said(checked[1] as CheckedProject)).toContain(P1)
  })

  it('blocks a link whose token a project already on disk owns, naming that project', () => {
    const drop = directory(project(P1, { shareLinks: [link(OTHER), link(TOKEN)] }), [])
    const checked = only(drop, target({ tokens: owning(P3, [TOKEN]) }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(P3)
  })

  it('never puts a token in a reason, the preview being rendered into an admin page', () => {
    const drop = directory(project(P1, { shareLinks: [link(OTHER), link(TOKEN)] }), [])
    const checked = only(drop, target({ tokens: owning(P3, [TOKEN, OTHER]) }))
    expect(JSON.stringify(checked.reasons)).not.toContain(TOKEN)
    expect(JSON.stringify(checked.reasons)).not.toContain(OTHER)
  })

  it('blocks two links of one project that carry the same token', () => {
    const shareLinks = [link(OTHER), link(TOKEN), link(TOKEN, { name: 'Twin' })]
    const checked = only(directory(project(P1, { shareLinks }), []))
    expect(checked.outcome).toBe('blocked')
  })

  it('leaves a token the target already records for this very project alone, for a replace', () => {
    const drop = directory(project(P1, { shareLinks: [link(TOKEN)] }), [])
    const checked = only(drop, target({ tokens: owning(P1, [TOKEN]), projectIds: [P1] }))
    expect(checked.outcome).toBe('importable')
    expect(checked.existsInTarget).toBe(true)
  })
})

describe('id, token and role validity, which nothing downstream of import repeats', () => {
  it('blocks a legacy tab id that is a path, before taskFile() throws at write time', () => {
    const checked = only(legacy({ tabs: [legacyTab(T1), legacyTab('../etc/passwd')] }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain('../etc/passwd')
  })

  it('blocks a legacy project id that is not a ULID', () => {
    const checked = only(legacy({ id: 'not-a-ulid' }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain('not-a-ulid')
  })

  it.each([
    ['a token of twelve characters', 'aaaaaaaaaaaa'],
    ['a token carrying dots', 'aaaa.bbbb.cccc.dddd'],
  ])('blocks %s, which revoke and rename could never name', (_label, value) => {
    expect(isShareToken(value)).toBe(false)
    const links = [{ token: TOKEN, name: 'Fine' }, { token: value, name: 'Planted' }]
    const checked = only(legacy({ shareLinks: links }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).not.toContain(value)
    expect(checked.reasons).toContain('Share link 1 carries a token that is not a share token')
  })

  it.each([
    [{ role: 'owner' as Role }, 'Share link 1 declares a role this product does not have'],
    [{ createdBy: 'short' }, 'Share link 1 names a parent token that is not a share token'],
  ])('blocks a share link the contracts would have refused: %o', (overrides, reason) => {
    const shareLinks = [link(TOKEN), link(OTHER, overrides)]
    const checked = only(built({ manifest: project(P1, { shareLinks }), documents: [] }))
    expect(checked.outcome).toBe('blocked')
    expect(checked.reasons).toContain(reason)
  })

  it('blocks a folder id and a tab id that are not ULIDs, not only the ids that name files', () => {
    const folders = [folder(F1, 'Phase one'), folder('../etc', 'Planted')]
    const documents = [documentOf(T1, [tabAt(B1, 0), tabAt('../etc', 1)])]
    const drop = built({ manifest: project(P1, { folders, tasks: entriesFor([T1]) }), documents })
    const checked = only(drop)
    expect(checked.outcome).toBe('blocked')
    expect(checked.reasons.filter((reason) => reason.includes('../etc'))).toHaveLength(2)
  })
})

describe('id uniqueness, which shape-checking does not give', () => {
  it('blocks a bundle whose nine entries and nine documents share a task id', () => {
    const ids = [...taskIds(8), T1]
    const raw = project(P1, { tasks: entriesFor(ids) })
    const checked = only(bundled(raw, documentsFor(ids)))
    expect(raw.tasks).toHaveLength(9)
    expect(new Set(ids).size).toBe(8)
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(T1)
    expect(said(checked)).not.toMatch(/no file|does not name/)
  })

  it('blocks two folders of one project that share an id', () => {
    const folders = [folder(F1, 'Phase one'), folder(F2, 'Phase two'), folder(F1, 'Twin')]
    const checked = only(directory(project(P1, { folders }), []))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(F1)
  })

  it('blocks two tabs of one task document that share an id', () => {
    const documents = [documentOf(T1, [tabAt(B1, 0), tabAt(B2, 1), tabAt(B1, 2)])]
    const raw = project(P1, { tasks: [taskEntry(T1, 'Go-live', { tabCount: 3 })] })
    const checked = only(directory(raw, documents))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(B1)
    expect(said(checked)).toContain(T1)
  })

  it('blocks the second group to claim a project id, leaving the first to import', () => {
    const first = directory(project(P1, { tasks: entriesFor([T1]) }), documentsFor([T1]))
    const second = bundled(project(P1), [])
    const checked = checkImport([first, second], target())
    expect(checked.map((one) => one.outcome)).toEqual(['importable', 'blocked'])
    expect(checked[1]?.projectId).toBeNull()
    expect(said(checked[1] as CheckedProject)).toContain(P1)
    expect(said(checked[1] as CheckedProject)).toContain(`volume/${P1}`)
  })
})

describe('folder reference integrity, which assertFolder treats as an invariant', () => {
  it('blocks a task naming a folder its own project does not have, naming both', () => {
    const tasks = [
      taskEntry(T1, 'Filed', { folderId: F1 }),
      taskEntry(T2, 'Dangling', { folderId: F3 }),
    ]
    const folders = [folder(F1, 'Phase one'), folder(F2, 'Phase two')]
    const checked = only(directory(project(P1, { folders, tasks }), documentsFor([T1, T2])))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(T2)
    expect(said(checked)).toContain(F3)
  })

  it('blocks a task naming a folder that exists in another project of the same session', () => {
    const owner = bundled(project(P2, { folders: [folder(F3, 'Elsewhere')] }), [], 1)
    const tasks = [taskEntry(T1, 'Dangling', { folderId: F3 })]
    const folders = [folder(F1, 'Phase one')]
    const drop = bundled(project(P1, { folders, tasks }), documentsFor([T1]))
    const checked = checkImport([drop, owner], target())
    expect(checked[0]?.outcome).toBe('blocked')
    expect(said(checked[0] as CheckedProject)).toContain(F3)
    expect(checked[1]?.outcome).toBe('importable')
  })
})

describe('collection bounds, because import never reaches assertWithin', () => {
  it('blocks a legacy project carrying more tasks than a project may hold', () => {
    const tabs = taskIds(LIMITS.tasksPerProject + 1).map((id) => legacyTab(id))
    const checked = only(legacy({ tabs }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(String(LIMITS.tasksPerProject))
  })

  it('blocks a legacy project carrying more share links than a project may hold', () => {
    const links = taskIds(LIMITS.shareLinksPerProject + 1).map((_id, index) => ({
      token: token(index + 10),
      name: 'Sam',
    }))
    const checked = only(legacy({ shareLinks: links }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(String(LIMITS.shareLinksPerProject))
  })

  it('blocks a task document holding more tabs than a task may hold', () => {
    const tabs = Array.from({ length: LIMITS.tabsPerTask + 1 }, (_unused, index) =>
      tabAt(marked('01B', 200 + index), index),
    )
    const raw = project(P1, { tasks: [taskEntry(T1, 'Go-live', { tabCount: 8 })] })
    const checked = only(built({ manifest: raw, documents: [documentOf(T1, tabs)] }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(String(LIMITS.tabsPerTask))
  })

  it('blocks a project carrying more folders than a project may hold', () => {
    const folders = Array.from({ length: LIMITS.foldersPerProject + 1 }, (_unused, index) =>
      folder(marked('01F', 100 + index), 'Phase'),
    )
    const checked = only(built({ manifest: project(P1, { folders }), documents: [] }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(String(LIMITS.foldersPerProject))
  })

  it('counts what is on disk as well as the drop, so two confirms cannot land twice the cap', () => {
    const onDisk = Array.from({ length: LIMITS.projectsPerProduct - 5 }, (_unused, index) =>
      marked('01Q', index + 1),
    )
    const drops = taskIds(6).map((_id, index) =>
      bundled(project(marked('01R', index + 1)), [], index),
    )
    const checked = checkImport(drops, target({ projectIds: onDisk }))
    expect(checked.every((one) => one.outcome === 'blocked')).toBe(true)
    expect(said(checked[0] as CheckedProject)).toContain(String(LIMITS.projectsPerProduct))
  })

  it('counts what a confirm will add and not what it will overwrite, a full store taking a replace', () => {
    const onDisk = [
      ...Array.from({ length: LIMITS.projectsPerProduct - 1 }, (_unused, index) =>
        marked('01Q', index + 1),
      ),
      P1,
    ]
    expect(onDisk).toHaveLength(LIMITS.projectsPerProduct)
    const checked = only(directory(project(P1), []), target({ projectIds: onDisk }))
    expect(checked.existsInTarget).toBe(true)
    expect(checked.reasons).toEqual([])
    expect(checked.outcome).toBe('importable')
  })

  it('adds the cap reason only to the rows that would add a project, not to one already refused', () => {
    const onDisk = Array.from({ length: LIMITS.projectsPerProduct - 1 }, (_unused, index) =>
      marked('01Q', index + 1),
    )
    const tasks = [taskEntry(T1, 'Dangling', { folderId: F3 })]
    const already = bundled(project(P2, { tasks }), documentsFor([T1]), 9)
    const adding = [1, 2].map((at) => bundled(project(marked('01R', at)), [], at))
    const checked = checkImport([already, ...adding], target({ projectIds: onDisk }))
    expect(checked.map((one) => one.outcome)).toEqual(['blocked', 'blocked', 'blocked'])
    expect(checked[0]?.reasons).toHaveLength(1)
    expect(said(checked[0] as CheckedProject)).toContain(F3)
    expect(said(checked[0] as CheckedProject)).not.toContain('the limit is')
    for (const one of checked.slice(1)) {
      expect(said(one)).toContain(`holds ${String(LIMITS.projectsPerProduct + 1)} projects`)
    }
  })

  it('leaves a drop that fits beside what is on disk alone', () => {
    const onDisk = Array.from({ length: LIMITS.projectsPerProduct - 6 }, (_unused, index) =>
      marked('01Q', index + 1),
    )
    const drops = taskIds(6).map((_id, index) =>
      bundled(project(marked('01R', index + 1)), [], index),
    )
    const checked = checkImport(drops, target({ projectIds: onDisk }))
    expect(checked.every((one) => one.outcome === 'importable')).toBe(true)
  })

  it('bounds no name itself, a padded one the schemas accept being no reason to refuse', () => {
    const padded = ` ${'x'.repeat(LIMITS.nameLength)} `
    expect(ProjectView.safeParse(project(P1, { name: padded })).success).toBe(true)
    const tabs = [tabAt(B1, 0), { ...tabAt(B2, 1), name: padded }]
    const tasks = [{ ...taskEntry(T1, 'Go-live', { tabCount: 2 }), name: padded }]
    const shareLinks = [link(TOKEN, { name: padded })]
    const raw = project(P1, { name: padded, folders: [folder(F1, padded)], tasks, shareLinks })
    const checked = only(directory(raw, [documentOf(T1, tabs)]))
    expect(checked.reasons).toEqual([])
    expect(checked.outcome).toBe('importable')
    expect(checked.converted?.manifest.name).toHaveLength(LIMITS.nameLength)
  })

  it('leaves an over-long name to the schema, which refuses it, and to cleanName, which cuts it', () => {
    const long = 'x'.repeat(200)
    const tasks = [taskEntry(T1, 'Fine'), { ...taskEntry(T2, 'Long'), name: long }]
    const checked = only(directory(project(P1, { tasks }), documentsFor([T1, T2])))
    expect(checked.outcome).toBe('blocked')
    expect(checked.reasons).toHaveLength(1)
    expect(said(checked)).toContain('tasks.1.name')
    expect(cleanName(long, 'fallback')).toHaveLength(LIMITS.nameLength)
  })
})

describe('scope containment, which a bundle can break without naming anything unknown', () => {
  it('blocks a link scoped to a task that belongs to another project of the same bundle', () => {
    const elsewhere = bundled(project(P2, { tasks: entriesFor([T2]) }), documentsFor([T2]), 1)
    const shareLinks = [
      link(TOKEN, { scope: { kind: 'task', projectId: P1, taskId: T1 } }),
      link(OTHER, { scope: { kind: 'task', projectId: P1, taskId: T2 } }),
    ]
    const raw = project(P1, { tasks: entriesFor([T1]), shareLinks })
    const checked = checkImport([bundled(raw, documentsFor([T1])), elsewhere], target())
    expect(checked[0]?.outcome).toBe('blocked')
    expect(said(checked[0] as CheckedProject)).toContain(T2)
    expect(checked[1]?.outcome).toBe('importable')
  })

  it('blocks a link whose scope names another project outright', () => {
    const shareLinks = [link(TOKEN), link(OTHER, { scope: { kind: 'project', projectId: P2 } })]
    const checked = only(directory(project(P1, { shareLinks }), []))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(P2)
  })

  it('accepts a link scoped to a task of its own project', () => {
    const shareLinks = [link(TOKEN, { scope: { kind: 'task', projectId: P1, taskId: T1 } })]
    const raw = project(P1, { tasks: entriesFor([T1]), shareLinks })
    expect(only(directory(raw, documentsFor([T1]))).outcome).toBe('importable')
  })
})

describe('document validation, at preview rather than half way through a write', () => {
  it('blocks a javascript: href in the second tab of the second task, naming all three', () => {
    const documents = [
      documentOf(T1, [tabAt(B1, 0)]),
      documentOf(T2, [tabAt(B1, 0), tabAt(B2, 1, HOSTILE)]),
    ]
    const raw = project(P1, { tasks: entriesFor([T1, T2]) })
    const checked = only(directory(raw, documents))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(P1)
    expect(said(checked)).toContain(T2)
    expect(said(checked)).toContain(B2)
    expect(said(checked)).toContain('javascript')
  })

  it('blocks a legacy tab whose document is not a document at all', () => {
    const checked = only(legacy({ tabs: [legacyTab(T1), legacyTab(T2, { document: 'nope' })] }))
    expect(checked.outcome).toBe('blocked')
    expect(said(checked)).toContain(T2)
  })
})

describe('what the checks answer with', () => {
  it('reports importable with the converted project, so a caller need not convert again', () => {
    const raw = project(P1, { tasks: entriesFor([T1]), shareLinks: [link(TOKEN)] })
    const checked = only(directory(raw, documentsFor([T1])))
    expect(checked).toMatchObject({
      path: `volume/${P1}`,
      projectId: P1,
      outcome: 'importable',
      reasons: [],
      existsInTarget: false,
    })
    expect(checked.converted?.manifest.id).toBe(P1)
    expect(checked.converted?.documents).toHaveLength(1)
  })

  it('says a project id is already in the target, which is what §7.4 renders', () => {
    const checked = only(directory(project(P1), []), target({ projectIds: [P2, P1] }))
    expect(checked.existsInTarget).toBe(true)
    const missing = only(directory(project(P1), []), target({ projectIds: [P2] }))
    expect(missing.existsInTarget).toBe(false)
  })

  it('reports an unusable project id as null rather than handing a confirm one it refused', () => {
    expect(only(legacy({ id: 'not-a-ulid' })).projectId).toBeNull()
  })

  it('describes every problem at once rather than the first one it found', () => {
    const tasks = [taskEntry(T1, 'Dangling', { folderId: F3 })]
    const shareLinks = [link(TOKEN, { scope: { kind: 'project', projectId: P2 } })]
    const documents = [documentOf(T1, [tabAt(B1, 0, HOSTILE)])]
    const raw = project(P1, { tasks, shareLinks })
    const checked = only(directory(raw, documents), target({ tokens: owning(P3, [TOKEN]) }))
    expect(checked.reasons.length).toBeGreaterThanOrEqual(4)
    expect(said(checked)).toContain(F3)
    expect(said(checked)).toContain(P2)
    expect(said(checked)).toContain(P3)
    expect(said(checked)).toContain('javascript')
  })

  it('gives every blocked project a reason, which a preview row cannot render without', () => {
    const drops = [
      directory({ id: P1 }, []),
      legacy({ id: 'not-a-ulid' }),
      directory(project(P1, { tasks: entriesFor([T1]) }), []),
    ]
    for (const drop of drops) {
      const checked = only(drop)
      expect(checked.outcome).toBe('blocked')
      expect(checked.reasons.length).toBeGreaterThan(0)
    }
  })

  it('keeps every reason inside the preview text bound, however long the drop made it', () => {
    const hostile = 'z'.repeat(4000)
    const raw = project(P1, { tasks: entriesFor(taskIds(9)) })
    const drops = [
      directory(raw, documentsFor(taskIds(9, 21))),
      legacy({ id: hostile, tabs: [legacyTab(hostile, { document: HOSTILE })] }),
      directory(project(P1, { tasks: [{ ...taskEntry(T1, 'x'), name: hostile }] }), []),
    ]
    for (const drop of drops) {
      const checked = only(drop)
      expect(checked.reasons.length).toBeGreaterThan(0)
      for (const reason of checked.reasons) {
        expect([...reason].length).toBeLessThanOrEqual(MAX_PREVIEW_TEXT_LENGTH)
      }
    }
  })

  it('cuts a reason the drop made longer than a row can hold, rather than storing it whole', () => {
    const hostile = 'z'.repeat(4000)
    const checked = only(legacy({ id: hostile, tabs: [legacyTab(hostile, { document: HOSTILE })] }))
    const atTheBound = checked.reasons.filter(
      (reason) => [...reason].length === MAX_PREVIEW_TEXT_LENGTH,
    )
    expect(atTheBound).toHaveLength(1)
    expect(atTheBound[0]).toContain('…')
    expect(atTheBound[0]).toContain('javascript')
    expect(atTheBound[0]).toContain(' task ')
  })

  it('spends its last reason saying how many it dropped, a row holding only so many', () => {
    const planted = Array.from({ length: MAX_PREVIEW_REASONS + 5 }, (_unused, index) => ({
      token: `short${String(index)}`,
      name: 'Planted',
    }))
    const checked = only(legacy({ shareLinks: planted }))
    expect(checked.reasons).toHaveLength(MAX_PREVIEW_REASONS)
    expect(checked.reasons.at(-1)).toBe('and 7 more problems')
  })

  it('checks every project of a session independently, one bad row not spoiling the rest', () => {
    const good = directory(project(P1, { tasks: entriesFor([T1]) }), documentsFor([T1]))
    const bad = bundled(project(P2, { tasks: entriesFor([T2]) }), [], 1)
    const checked = checkImport([good, bad], target())
    expect(checked.map((one) => one.outcome)).toEqual(['importable', 'blocked'])
  })

  it('answers an empty session with an empty plan rather than a throw', () => {
    expect(checkImport([], target())).toEqual([])
  })
})
