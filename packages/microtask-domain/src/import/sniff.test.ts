import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BUNDLE_FORMAT,
  BUNDLE_VERSION,
  ExportBundle,
  MAX_PREVIEW_TEXT_LENGTH,
} from '@repo/contracts'
import { Invalid } from '@repo/kernel'
import type { TaskEntry } from '../entities/manifest.js'
import { manifest, STAMP, taskDocument, taskEntry } from '../testing/fixtures.js'
import { sniffGroup, sniffImportFiles, type ImportFile, type SniffedGroup } from './sniff.js'

const P1 = '01M240ERCRWWCN16Q5AHP1FZAQ'
const T1 = '01M25000000000000000000001'
const T2 = '01M25000000000000000000002'
const TAB1 = '01M25000000000000000000003'

/**
 * The two projects `data/projects/` actually holds, mechanically neutralised by
 * `packages/contracts/scripts/derive-legacy-fixture.mjs`.
 *
 * Reached by relative path the way `legacy.test.ts` and contracts' own `document-facts.test.ts`
 * reach them, `@repo/contracts` publishing only `"."`. Both are sniffed, because one sample cannot
 * be mistaken for the shape: the first carries four tabs and two share links, the second one tab
 * and an **empty** `shareLinks` — which is the array the legacy keys were once type-checked on.
 */
const FIXTURES = [
  new URL('../../../contracts/src/testing/legacy-project.fixture.json', import.meta.url),
  new URL('../../../contracts/src/testing/legacy-project-2.fixture.json', import.meta.url),
] as const

const file = (path: string, json: unknown): ImportFile => ({ path, json })

const without = (json: object, dropped: string): Record<string, unknown> =>
  Object.fromEntries(Object.entries(json).filter(([key]) => key !== dropped))

const one = (path: string, json: unknown): SniffedGroup => {
  const sniffed = sniffImportFiles([file(path, json)])
  return sniffed[0] as SniffedGroup
}

const tab = (id: string) => ({
  id,
  name: 'Checklist',
  position: 0,
  document: { type: 'doc', content: [] },
  createdAt: STAMP,
  updatedAt: STAMP,
})

const project = (id: string, entry: TaskEntry = taskEntry(T1, 'Task')) => ({
  ...manifest(id, { tasks: [entry] }),
  taskDocuments: [taskDocument(T1, TAB1)],
})

const bundle = (projects: readonly unknown[]) => ({
  format: BUNDLE_FORMAT,
  version: BUNDLE_VERSION,
  exportedAt: STAMP,
  bundleId: P1,
  projects,
})

const legacy = () => ({
  id: P1,
  name: 'Legacy',
  createdAt: STAMP,
  updatedAt: STAMP,
  tabs: [tab(T1)],
  shareLinks: [{ token: 'a'.repeat(32), name: '', permission: 'write', createdAt: STAMP }],
})

describe('sniffImportFiles', () => {
  it('classifies a manifest and its task files as one directory whose tasks are members', () => {
    const sniffed = sniffImportFiles([
      file(`volume/${P1}/project.json`, project(P1)),
      file(`volume/${P1}/tasks/${T1}.json`, { id: T1, tabs: [tab(T1)] }),
      file(`volume/${P1}/tasks/${T2}.json`, { id: T2, tabs: [tab(T2)] }),
    ])
    expect(sniffed).toHaveLength(1)
    expect(sniffed[0]?.shape).toBe('v2-project-directory')
    expect(sniffed[0]?.error).toBeNull()
    expect(sniffed[0]?.group.taskFiles).toHaveLength(2)
    expect(sniffed.filter((group) => group.shape === 'unrecognised')).toEqual([])
  })

  it('re-runs path normalisation, so the server does not trust what a client normalised', () => {
    expect(() => sniffImportFiles([file('../../etc/passwd', legacy())])).toThrow(Invalid)
    expect(() => sniffImportFiles([file('/etc/passwd', legacy())])).toThrow(Invalid)
    expect(() => sniffImportFiles([file('C:\\data\\project.json', legacy())])).toThrow(Invalid)
  })
})

describe('sniffGroup', () => {
  it('names project.json and the directory when task files have no manifest beside them', () => {
    const sniffed = one(`volume/${P1}/tasks/${T1}.json`, { id: T1, tabs: [] })
    expect(sniffed.shape).toBe('unrecognised')
    expect(sniffed.error).toContain('project.json')
    expect(sniffed.error).toContain(`volume/${P1}`)
  })

  it('reads a bundle carrying one project as a single project', () => {
    expect(one('export.json', bundle([project(P1)])).shape).toBe('v2-single-project')
  })

  it('reads a bundle carrying several projects as a workspace bundle', () => {
    const many = bundle([project(P1), project(T2)])
    expect(one('export.json', many).shape).toBe('v2-workspace-bundle')
  })

  it('classifies on the discriminator alone, so a bundle its own schema refuses is still read', () => {
    const overcounting = bundle([project(P1, taskEntry(T1, 'Task', { tabCount: 9 }))])
    expect(ExportBundle.safeParse(overcounting).success).toBe(false)
    const sniffed = one('export.json', overcounting)
    expect(sniffed.shape).toBe('v2-single-project')
    expect(sniffed.error).toBeNull()
  })

  it('narrows a project directory to a manifest nothing downstream has to null-check', () => {
    const sniffed = one(`volume/${P1}/project.json`, project(P1))
    expect(sniffed.shape).toBe('v2-project-directory')
    if (sniffed.shape !== 'v2-project-directory') return
    expect(sniffed.manifest.path).toBe(`volume/${P1}/project.json`)
    expect(sniffed.error).toBeNull()
  })

  it('narrows a recognised loose file to the file itself, for the same reason', () => {
    const sniffed = one('export.json', bundle([project(P1)]))
    expect(sniffed.shape).toBe('v2-single-project')
    if (sniffed.shape !== 'v2-single-project') return
    expect(sniffed.file.path).toBe('export.json')
    expect(sniffed.error).toBeNull()
  })

  it('narrows an unrecognised group to a reason that is a string, not a maybe-string', () => {
    const sniffed = one('loose.json', { nothing: true })
    expect(sniffed.shape).toBe('unrecognised')
    if (sniffed.shape !== 'unrecognised') return
    expect(sniffed.error.length).toBeGreaterThan(0)
  })

  it('names the version found and the version supported for a bundle it cannot read', () => {
    const sniffed = one('export.json', { ...bundle([]), version: 3 })
    expect(sniffed.error).toContain('3')
    expect(sniffed.error).toContain(String(BUNDLE_VERSION))
    expect(sniffed.error).not.toMatch(/unrecognised/i)
  })

  it('names a version that is our number written as a string', () => {
    const sniffed = one('export.json', { ...bundle([]), version: '2' })
    expect(sniffed.shape).toBe('unrecognised')
    expect(sniffed.error).toContain('version')
  })

  it('reports an absent version as absent, a hand-written file being its likeliest source', () => {
    const sniffed = one('export.json', without(bundle([]), 'version'))
    expect(sniffed.shape).toBe('unrecognised')
    expect(sniffed.error).toContain('absent')
    expect(sniffed.error).toContain(String(BUNDLE_VERSION))
  })

  it('names the format when a file claims a format this repo does not read', () => {
    const sniffed = one('export.json', { ...bundle([]), format: 'other.product' })
    expect(sniffed.shape).toBe('unrecognised')
    expect(sniffed.error).toContain('other.product')
    expect(sniffed.error).toContain(BUNDLE_FORMAT)
  })

  it('says our own format and version carries no projects[] rather than calling it unknown', () => {
    const sniffed = one('export.json', without(bundle([]), 'projects'))
    expect(sniffed.error).toContain('projects')
  })

  it('detects a legacy project by its four keys and the absence of format', () => {
    const sniffed = one('legacy.json', legacy())
    expect(sniffed.shape).toBe('legacy-project')
    expect(sniffed.error).toBeNull()
  })

  it.each(FIXTURES.map((fixture, index) => [index, fixture] as const))(
    'detects legacy project %i as the production derivation actually produced it',
    (_index, fixture) => {
      const json: unknown = JSON.parse(readFileSync(fixture, 'utf8'))
      expect(one('legacy.json', json).shape).toBe('legacy-project')
    },
  )

  it.each([
    ['a tabs[] that is a string', { tabs: 'nope' }],
    ['a shareLinks[] that is null', { shareLinks: null }],
    ['an id that is a number', { id: 42 }],
  ])(
    'classifies a legacy project carrying %s, so the preview says what is wrong with it',
    (_label, broken) => {
      const sniffed = one('legacy.json', { ...legacy(), ...broken })
      expect(sniffed.shape).toBe('legacy-project')
      expect(sniffed.error).toBeNull()
    },
  )

  it.each(['tabs', 'shareLinks', 'id', 'name'])(
    'does not read a file missing %s as a legacy project',
    (key) => {
      expect(one('legacy.json', without(legacy(), key)).shape).toBe('unrecognised')
    },
  )

  it('lets format win over the legacy keys, since a v2 file may carry both', () => {
    const both = { ...legacy(), format: BUNDLE_FORMAT, version: BUNDLE_VERSION, projects: [] }
    expect(one('legacy.json', both).shape).toBe('v2-workspace-bundle')
  })

  it.each([
    ['a JSON array', [1, 2, 3]],
    ['a JSON string', 'nope'],
    ['a JSON number', 42],
    ['JSON null', null],
  ])('does not read %s as any shape', (_label, json) => {
    expect(one('loose.json', json).shape).toBe('unrecognised')
  })

  it('gives every group it refuses a reason, because a preview row cannot render empty', () => {
    const refused = [
      one('loose.json', { nothing: true }),
      one('loose.json', null),
      one('export.json', { ...bundle([]), version: 3 }),
      one(`volume/${P1}/tasks/${T1}.json`, { id: T1 }),
    ]
    for (const group of refused) {
      expect(group.shape).toBe('unrecognised')
      expect(group.error).not.toBeNull()
      expect((group.error ?? '').length).toBeGreaterThan(0)
    }
  })

  it('answers a group built by hand rather than by grouping, the type admitting an empty one', () => {
    const sniffed = sniffGroup({ path: 'nothing', manifest: null, taskFiles: [], file: null })
    expect(sniffed.shape).toBe('unrecognised')
    expect(sniffed.error).toContain('harvested')
  })

  it('elides a long path down its middle, so the orphan reason still names its directory', () => {
    const deep = `${'enclosing/'.repeat(20)}volume/${P1}/tasks/${T1}.json`
    const sniffed = one(deep, { id: T1 })
    expect(sniffed.error).toContain(`volume/${P1}`)
    expect(sniffed.error).toContain('enclosing/')
    expect((sniffed.error ?? '').length).toBeLessThanOrEqual(MAX_PREVIEW_TEXT_LENGTH)
  })

  it('keeps every reason inside the preview text bound, however long the drop made it', () => {
    const reasons = [
      one(`${'deep/'.repeat(60)}tasks/${T1}.json`, { id: T1 }).error,
      one('export.json', { ...bundle([]), format: 'x'.repeat(4000) }).error,
      one('export.json', { ...bundle([]), version: 'v'.repeat(4000) }).error,
    ]
    for (const reason of reasons) {
      expect(reason).not.toBeNull()
      expect((reason ?? '').length).toBeLessThanOrEqual(MAX_PREVIEW_TEXT_LENGTH)
    }
  })
})
