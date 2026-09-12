import { describe, expect, it } from 'vitest'
import { BUNDLE_FORMAT, BUNDLE_VERSION, ExportBundle, ExportedProject } from './bundle.js'
import { ProjectManifest } from './project.js'
import { MAX_LISTED_TAB_NAMES } from './task.js'

const ulid = (seed: number): string => `01M240ERCRWWCN16Q5AH${String(seed).padStart(6, '0')}`

const STAMP = '2026-09-10T00:00:00.000Z'
const OFFSET_STAMP = '2026-09-10T11:30:00+02:00'

const tab = (task: number, position: number) => ({
  id: ulid(task * 100 + position),
  name: `Tab ${String(position)}`,
  position,
  document: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: `task ${String(task)} tab ${String(position)}` }] },
    ],
  },
  createdAt: STAMP,
  updatedAt: STAMP,
})

const taskDocument = (task: number, tabs: number) => ({
  id: ulid(task),
  tabs: Array.from({ length: tabs }, (_, position) => tab(task, position)),
  createdAt: OFFSET_STAMP,
  updatedAt: STAMP,
})

const WIDE = taskDocument(11, MAX_LISTED_TAB_NAMES + 1)
const NARROW = taskDocument(12, 2)

const entryFor = (document: typeof WIDE, position: number) => ({
  id: document.id,
  name: `Task ${String(position)}`,
  position,
  folderId: null,
  progress: { done: 1, total: 3 },
  updatedAt: document.updatedAt,
  tabCount: document.tabs.length,
  tabNames: document.tabs.slice(0, MAX_LISTED_TAB_NAMES).map((one) => one.name),
})

const project = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: ulid(1),
  name: 'Launch',
  folders: [],
  tasks: [entryFor(WIDE, 0), entryFor(NARROW, 1)],
  shareLinks: [],
  createdAt: OFFSET_STAMP,
  updatedAt: STAMP,
  taskDocuments: [WIDE, NARROW],
  ...over,
})

const bundle = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: BUNDLE_FORMAT,
  version: BUNDLE_VERSION,
  exportedAt: OFFSET_STAMP,
  bundleId: ulid(2),
  projects: [project()],
  ...over,
})

describe('the fixture is discriminating enough for the assertions below to mean something', () => {
  it('holds two tasks, one of them with more tabs than a list row names', () => {
    expect(WIDE.tabs.length).toBeGreaterThan(MAX_LISTED_TAB_NAMES)
    expect(NARROW.tabs).toHaveLength(2)
    expect(WIDE.id).not.toBe(NARROW.id)
  })

  it('gives every tab a distinct non-empty document, so one body kept for all would show', () => {
    const bodies = [...WIDE.tabs, ...NARROW.tabs].map((one) => JSON.stringify(one.document))
    expect(new Set(bodies).size).toBe(bodies.length)
    expect(bodies.every((body) => body.includes('paragraph'))).toBe(true)
  })
})

describe('the bundle format is a discriminator, not a pair of loose fields (ADR 0018)', () => {
  it('states the two values the design fixes, which a sniffer matches on', () => {
    expect([BUNDLE_FORMAT, BUNDLE_VERSION]).toEqual(['ccg.microtask', 2])
  })

  it('accepts the bundle an export writes', () => {
    expect(ExportBundle.safeParse(bundle()).error?.issues ?? []).toEqual([])
  })

  it('refuses the format of anything else, so it is a literal rather than a string', () => {
    expect(ExportBundle.safeParse(bundle({ format: 'ccg.macroplan' })).success).toBe(false)
    expect(ExportBundle.safeParse(bundle({ format: '' })).success).toBe(false)
  })

  it('refuses a version it does not read, so that is a literal rather than a number', () => {
    expect(ExportBundle.safeParse(bundle({ version: 1 })).success).toBe(false)
    expect(ExportBundle.safeParse(bundle({ version: 3 })).success).toBe(false)
  })

  it('types the discriminator as the literal itself, so a wrong one cannot even typecheck', () => {
    const parsed = ExportBundle.parse(bundle())
    const format: 'ccg.microtask' = parsed.format
    const version: 2 = parsed.version
    expect([format, version]).toEqual([BUNDLE_FORMAT, BUNDLE_VERSION])
  })

  it('requires a bundle id, because "did I already import this?" has to be answerable', () => {
    const { bundleId, ...without } = bundle()
    expect(bundleId).toBeDefined()
    expect(ExportBundle.safeParse(without).success).toBe(false)
    expect(ExportBundle.safeParse(bundle({ bundleId: 'not-a-ulid' })).success).toBe(false)
  })
})

describe('an exported project is self-contained by construction', () => {
  it('is the manifest own fields plus the task documents, with nothing renamed', () => {
    expect(Object.keys(ExportedProject.shape)).toEqual([...Object.keys(ProjectManifest.shape), 'taskDocuments'])
  })

  it('still parses as a manifest once the documents are set aside', () => {
    const { taskDocuments, ...manifest } = project()
    expect(taskDocuments).toBeDefined()
    expect(ProjectManifest.safeParse(manifest).error?.issues ?? []).toEqual([])
  })

  it('carries every tab of every task, deep-equal and in order', () => {
    const documents = ExportBundle.parse(bundle()).projects[0]?.taskDocuments ?? []
    expect(documents.map((one) => one.id)).toEqual([WIDE.id, NARROW.id])
    expect(documents[0]?.tabs).toEqual(WIDE.tabs)
    expect(documents[1]?.tabs).toEqual(NARROW.tabs)
    expect(documents[0]?.tabs).toHaveLength(MAX_LISTED_TAB_NAMES + 1)
  })

  it('refuses a project whose task tabs were truncated, which "every tab" otherwise hides', () => {
    const truncated = { ...WIDE, tabs: WIDE.tabs.slice(0, 1) }
    const lossy = project({ taskDocuments: [truncated, NARROW] })
    expect(ExportedProject.safeParse(lossy).success).toBe(false)
    expect(ExportBundle.safeParse(bundle({ projects: [lossy] })).success).toBe(false)
  })

  it('refuses a project that kept only its first task, which a one-task fixture hides', () => {
    expect(ExportedProject.safeParse(project({ taskDocuments: [WIDE] })).success).toBe(false)
  })

  it('refuses a document for a task no manifest entry names', () => {
    const extra = taskDocument(13, 1)
    expect(ExportedProject.safeParse(project({ taskDocuments: [WIDE, NARROW, extra] })).success).toBe(false)
  })

  it('refuses two documents for one task, which a set comparison alone would let through', () => {
    const doubled = project({ tasks: [entryFor(WIDE, 0)], taskDocuments: [WIDE, WIDE] })
    expect(ExportedProject.safeParse(doubled).success).toBe(false)
  })

  it('accepts a cache that undercounts, because import recomputes all four of those fields', () => {
    const stale = { ...entryFor(WIDE, 0), tabCount: 1, tabNames: [WIDE.tabs[0]?.name ?? ''] }
    const understated = project({ tasks: [stale, entryFor(NARROW, 1)] })
    expect(ExportedProject.safeParse(understated).error?.issues ?? []).toEqual([])
  })

  it('requires the share-link block, an absent one being what warmTokenIndex dereferences', () => {
    const { shareLinks, ...without } = project()
    expect(shareLinks).toEqual([])
    expect(ExportedProject.safeParse(without).success).toBe(false)
  })

  it('accepts an empty share-link block, which is what a token-stripped export carries', () => {
    expect(ExportedProject.safeParse(project({ shareLinks: [] })).error?.issues ?? []).toEqual([])
  })
})

describe('a bundle round-trips through JSON and the schema unchanged', () => {
  it('gives back what was written, timestamps included', () => {
    const written = bundle()
    const parsed: unknown = ExportBundle.parse(JSON.parse(JSON.stringify(written)))
    expect(parsed).toEqual(written)
  })

  it('leaves every timestamp as written, so no coercion can hide behind the schema', () => {
    const parsed = ExportBundle.parse(JSON.parse(JSON.stringify(bundle())))
    const [first] = parsed.projects
    expect(parsed.exportedAt).toBe(OFFSET_STAMP)
    expect(first?.createdAt).toBe(OFFSET_STAMP)
    expect(first?.updatedAt).toBe(STAMP)
    expect(first?.taskDocuments[0]?.createdAt).toBe(OFFSET_STAMP)
    expect(first?.taskDocuments[0]?.tabs[0]?.updatedAt).toBe(STAMP)
    expect(typeof parsed.exportedAt).toBe('string')
  })
})
