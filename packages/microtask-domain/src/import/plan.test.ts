import { describe, expect, it } from 'vitest'
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  ImportPreview,
  ImportPreviewGroup,
  ImportPreviewShareLink,
  MAX_PREVIEW_TEXT_LENGTH,
} from '@repo/contracts'
import type { ProjectManifest } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { ShareIndex } from '../storage/share-index.js'
import { fixedClock } from '../testing/doubles.js'
import { manifest, marked, shareLink, STAMP, taskDocument, taskEntry, token } from '../testing/fixtures.js'
import type { ImportTarget } from './checks.js'
import type { ImportFile } from './sniff.js'
import { planImport, type PlannedProject } from './plan.js'

const P1 = marked('01P', 1)
const P2 = marked('01P', 2)
const T1 = marked('01T', 1)
const T2 = marked('01T', 2)
const B1 = marked('01B', 1)
const B2 = marked('01B', 2)
const SESSION = marked('01S', 1)

const clock = fixedClock(STAMP)

const target = (projectIds: readonly string[] = [], tokens = new ShareIndex()): ImportTarget => ({
  product: 'microtask',
  tokens,
  projectIds,
})

const project = (id: string, tasks: readonly string[] = [T1]): ProjectManifest =>
  manifest(id, { tasks: tasks.map((one) => taskEntry(one, `Task ${one.slice(-1)}`)) })

const documentsFor = (tasks: readonly string[]): readonly TaskDocument[] =>
  tasks.map((one, at) => taskDocument(one, at === 0 ? B1 : B2))

const directory = (at: string, id: string, tasks: readonly string[] = [T1]): readonly ImportFile[] => [
  { path: `${at}/project.json`, json: project(id, tasks) },
  ...tasks.map((one, index) => ({
    path: `${at}/tasks/${one}.json`,
    json: documentsFor(tasks)[index],
  })),
]

const bundleOf = (path: string, ids: readonly string[]): ImportFile => ({
  path,
  json: {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: STAMP,
    bundleId: marked('01X', 1),
    projects: ids.map((id) => ({ ...project(id), taskDocuments: documentsFor([T1]) })),
  },
})

const legacyFile = (path: string, id: string): ImportFile => ({
  path,
  json: {
    id,
    name: 'Legacy launch',
    tabs: [{ id: T1, name: 'Notes', position: 0, document: { type: 'doc', content: [] } }],
    shareLinks: [{ token: token(7), permission: 'read' }],
  },
})

const rows = (files: readonly ImportFile[], at: ImportTarget = target()): readonly PlannedProject[] =>
  planImport(files, at, clock)

const outcomes = (planned: readonly PlannedProject[]): readonly string[] =>
  planned.map((one) => one.row.outcome)

const keysOf = (value: unknown): readonly string[] =>
  value !== null && typeof value === 'object' ? Object.keys(value).sort() : []

describe('the plan a preview renders and a confirm applies', () => {
  it('describes a v2 project directory as one importable row, counting its tasks both ways', async () => {
    const planned = rows(directory('drop/launch', P1, [T1, T2]))
    expect(planned.map((one) => one.row)).toEqual([
      {
        path: 'drop/launch',
        shape: 'v2-project-directory',
        projectId: P1,
        name: 'Launch',
        manifestTaskCount: 2,
        taskFilesFound: 2,
        shareLinks: [],
        existsInTarget: false,
        outcome: 'importable',
        reasons: [],
      },
    ])
  })

  it('satisfies the schema the route answers with, field for field, links included', () => {
    const files = [
      { path: 'drop/launch/project.json', json: { ...project(P1), shareLinks: [shareLink(token(4), P1)] } },
      { path: `drop/launch/tasks/${T1}.json`, json: taskDocument(T1, B1) },
    ]
    const row = rows(files)[0]?.row
    const parsed = ImportPreviewGroup.safeParse(row)
    expect(parsed.error?.issues ?? []).toEqual([])
    expect(keysOf(parsed.data)).toEqual(keysOf(row))
    expect(row?.shareLinks.length).toBe(1)
    for (const link of row?.shareLinks ?? []) {
      const one = ImportPreviewShareLink.safeParse(link)
      expect(one.error?.issues ?? []).toEqual([])
      expect(keysOf(one.data)).toEqual(keysOf(link))
    }
  })

  it('hands back the project a confirm would write, beside the row a preview renders', () => {
    const planned = rows(directory('drop/launch', P1, [T1, T2]))
    expect(planned[0]?.project?.manifest.id).toBe(P1)
    expect(planned[0]?.project?.documents.map((one) => one.id)).toEqual([T1, T2])
  })

  it('explodes a workspace bundle into one row per project, labelled by position in the file', () => {
    const planned = rows([bundleOf('workspace.json', [P1, P2])])
    expect(planned.map((one) => [one.row.path, one.row.projectId, one.row.shape])).toEqual([
      ['workspace.json project 1', P1, 'v2-workspace-bundle'],
      ['workspace.json project 2', P2, 'v2-workspace-bundle'],
    ])
  })

  it('keeps a single-project bundle at the file’s own path, that file being the project', () => {
    const planned = rows([bundleOf('one-project.json', [P1])])
    expect(planned.map((one) => [one.row.path, one.row.shape])).toEqual([
      ['one-project.json', 'v2-single-project'],
    ])
  })

  it('counts a bundled project’s embedded documents as the task files found', () => {
    const planned = rows([bundleOf('workspace.json', [P1])])
    expect([planned[0]?.row.manifestTaskCount, planned[0]?.row.taskFilesFound]).toEqual([1, 1])
  })

  it('converts a legacy project into the one task its tabs hang off, and reports it importable', () => {
    const planned = rows([legacyFile('old.json', P1)])
    expect([planned[0]?.row.shape, planned[0]?.row.outcome, planned[0]?.row.name]).toEqual([
      'legacy-project',
      'importable',
      'Legacy launch',
    ])
    expect([planned[0]?.row.manifestTaskCount, planned[0]?.row.taskFilesFound]).toEqual([1, 1])
  })

  it('counts a legacy file of many tabs as one task all the same, the tabs being inside it', () => {
    const many = ['Notes', 'Risks', 'Go-live'].map((name, at) => ({
      id: marked('01T', at + 1),
      name,
      position: at,
      document: { type: 'doc', content: [] },
    }))
    const planned = rows([{ path: 'old.json', json: { id: P1, name: 'Legacy launch', tabs: many, shareLinks: [] } }])
    expect([planned[0]?.row.manifestTaskCount, planned[0]?.row.taskFilesFound]).toEqual([1, 1])
    expect(planned[0]?.project?.documents[0]?.tabs.map((tab) => tab.name)).toEqual([
      'Notes',
      'Risks',
      'Go-live',
    ])
  })

  it('reports a group it cannot read as an error row that says why, rather than skipping it', () => {
    const planned = rows([{ path: 'notes.txt', json: 'not an object' }])
    expect(planned[0]?.row.outcome).toBe('error')
    expect(planned[0]?.row.shape).toBe('unrecognised')
    expect(planned[0]?.row.reasons.length).toBe(1)
    expect(planned[0]?.project).toBeNull()
  })

  it('reports a file whose bytes did not parse as the same error row, json being null by then', () => {
    const planned = rows([{ path: 'truncated.json', json: null }])
    expect([planned[0]?.row.outcome, planned[0]?.row.manifestTaskCount]).toEqual(['error', null])
  })

  it('reports an orphaned tasks directory against the directory missing its manifest (ADR 0018)', () => {
    const planned = rows([{ path: 'drop/launch/tasks/x.json', json: taskDocument(T1, B1) }])
    expect(planned[0]?.row.path).toBe('drop/launch')
    expect(planned[0]?.row.reasons[0]).toContain('project.json')
  })

  it('gives every group a row, so a mixed drop is described in full', () => {
    const planned = rows([
      ...directory('drop/launch', P1),
      legacyFile('old.json', P2),
      { path: 'notes.txt', json: 42 },
    ])
    expect(planned.map((one) => one.row.shape)).toEqual([
      'v2-project-directory',
      'unrecognised',
      'legacy-project',
    ])
    expect(outcomes(planned)).toEqual(['importable', 'error', 'importable'])
  })
})

describe('what the plan reads off the target store, which is what makes it worth re-running', () => {
  it('marks a project the store already holds, which is the choice §7.4 asks about', () => {
    const planned = rows(directory('drop/launch', P1), target([P1]))
    expect(planned[0]?.row.existsInTarget).toBe(true)
  })

  it('marks one it does not, so that flag is not constant', () => {
    const planned = rows(directory('drop/launch', P1), target([P2]))
    expect(planned[0]?.row.existsInTarget).toBe(false)
  })

  it('blocks a project whose share token another project on disk already holds, naming that project', () => {
    const tokens = new ShareIndex()
    tokens.add('microtask', manifest(P2, { shareLinks: [shareLink(token(1), P2)] }))
    const files = [
      { path: 'drop/launch/project.json', json: { ...project(P1), shareLinks: [shareLink(token(1), P1)] } },
      { path: `drop/launch/tasks/${T1}.json`, json: taskDocument(T1, B1) },
    ]
    const planned = rows(files, target([P2], tokens))
    expect(planned[0]?.row.outcome).toBe('blocked')
    expect(planned[0]?.row.reasons.join(' ')).toContain(P2)
  })
})

describe('the two rules a preview row has to obey however hostile the drop is', () => {
  it('reports a share link by index, with no token anywhere in the row', () => {
    const files = [
      { path: 'drop/launch/project.json', json: { ...project(P1), shareLinks: [shareLink(token(3), P1)] } },
      { path: `drop/launch/tasks/${T1}.json`, json: taskDocument(T1, B1) },
    ]
    const planned = rows(files)
    expect(planned[0]?.row.shareLinks).toEqual([
      { index: 0, name: 'Sam at ACME', role: 'view', scope: { kind: 'project', projectId: P1 } },
    ])
    expect(JSON.stringify(planned[0]?.row)).not.toContain(token(3))
  })

  it('elides a path longer than a row may carry, keeping both ends that identify it', () => {
    const deep = `drop/${Array.from({ length: 10 }, () => 'x'.repeat(25)).join('/')}/launch`
    const planned = rows(directory(deep, P1))
    const path = planned[0]?.row.path ?? ''
    expect(path.length).toBeLessThanOrEqual(MAX_PREVIEW_TEXT_LENGTH)
    expect(path.startsWith('drop/')).toBe(true)
    expect(path.endsWith('/launch')).toBe(true)
    expect(ImportPreviewGroup.safeParse(planned[0]?.row).success).toBe(true)
  })

  it('lets one project id be claimed by one row only, blocking the second and nulling its id', () => {
    const planned = rows([...directory('drop/a', P1), ...directory('drop/b', P1)])
    expect(planned.map((one) => [one.row.path, one.row.projectId, one.row.outcome])).toEqual([
      ['drop/a', P1, 'importable'],
      ['drop/b', null, 'blocked'],
    ])
    expect(ImportPreview.safeParse({ sessionId: SESSION, groups: planned.map((one) => one.row) }).success).toBe(true)
  })

  it('still reports the counts of a blocked project, the row being what refuses it', () => {
    const planned = rows([...directory('drop/a', P1), ...directory('drop/b', P1, [T1, T2])])
    expect([planned[1]?.row.manifestTaskCount, planned[1]?.row.taskFilesFound]).toEqual([2, 2])
    expect(planned[1]?.project).not.toBeNull()
  })
})

describe('what a legacy conversion mints, which is nothing at all', () => {
  const twice = (): readonly [readonly PlannedProject[], readonly PlannedProject[]] => {
    const file = legacyFile('old.json', P1)
    return [planImport([file], target(), clock), planImport([file], target(), clock)]
  }

  it('keeps the file’s own id for the project and for the one task it converts', () => {
    const [planned] = twice()
    expect(planned[0]?.project?.manifest.id).toBe(P1)
    expect(planned[0]?.project?.manifest.tasks.map((one) => one.id)).toEqual([P1])
    expect(planned[0]?.project?.documents.map((one) => one.id)).toEqual([P1])
  })

  it('keeps the file’s own tab id inside that task, rather than minting one', () => {
    const [planned] = twice()
    expect(planned[0]?.project?.documents[0]?.tabs.map((one) => one.id)).toEqual([T1])
  })

  it('answers the identical plan both times, project and row alike, nothing having been minted', () => {
    const [first, second] = twice()
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })
})
