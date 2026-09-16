import { describe, expect, it } from 'vitest'
import { ImportConfirmResult, ImportProjectResult, ImportWriteOutcome } from './import-result.js'
import { MAX_PREVIEW_REASONS, MAX_PREVIEW_TEXT_LENGTH } from './import-plan.js'
import { LIMITS } from './limits.js'

const ulid = (seed: number): string => `01M240ERCRWWCN16Q5AH${String(seed).padStart(6, '0')}`

const PROJECT = ulid(1)
const REMINTED = ulid(2)
const SESSION = ulid(9)

const result = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  path: 'drop/launch',
  projectId: PROJECT,
  writtenProjectId: PROJECT,
  choice: null,
  outcome: 'created',
  tasksWritten: 3,
  tasksRemoved: 0,
  shareLinksReminted: 0,
  shareLinksStranded: 0,
  reasons: [],
  ...overrides,
})

const FIELDS = [
  'path',
  'projectId',
  'writtenProjectId',
  'choice',
  'outcome',
  'tasksWritten',
  'tasksRemoved',
  'shareLinksReminted',
  'shareLinksStranded',
  'reasons',
]

describe('ImportProjectResult', () => {
  it('describes exactly the fields a confirm reports, so a new one cannot be added silently', () => {
    expect(Object.keys(ImportProjectResult.parse(result())).sort()).toEqual([...FIELDS].sort())
  })

  it('names the five things a confirm can do with a project and no sixth', () => {
    expect(ImportWriteOutcome.options).toEqual([
      'created',
      'replaced',
      'skipped',
      'blocked',
      'failed',
    ])
  })

  it('carries a written id that differs from the previewed one, which is what a remint produces', () => {
    const minted = result({ choice: 'new', writtenProjectId: REMINTED, shareLinksReminted: 2 })
    expect(ImportProjectResult.parse(minted).writtenProjectId).toBe(REMINTED)
  })

  it('carries no written id for a project nothing was written for', () => {
    const skipped = result({ choice: 'skip', outcome: 'skipped', writtenProjectId: null })
    expect(ImportProjectResult.parse(skipped).writtenProjectId).toBeNull()
  })

  it('refuses a blocked project that says nothing, so no refusal can render empty', () => {
    const silent = result({ outcome: 'blocked', writtenProjectId: null, tasksWritten: 0 })
    expect(ImportProjectResult.safeParse(silent).success).toBe(false)
  })

  it('refuses a failed project that says nothing either, that being the one needing a look', () => {
    const silent = result({ outcome: 'failed', writtenProjectId: null, tasksWritten: 0 })
    expect(ImportProjectResult.safeParse(silent).success).toBe(false)
  })

  it('refuses a project that landed and gave a reason, an explained success being a contradiction', () => {
    expect(ImportProjectResult.safeParse(result({ reasons: ['?'] })).success).toBe(false)
  })

  it('takes a skipped project with no reason, a skip being the admin’s own choice', () => {
    const skipped = result({ choice: 'skip', outcome: 'skipped', writtenProjectId: null })
    expect(ImportProjectResult.safeParse(skipped).success).toBe(true)
  })

  it('bounds a path and a reason at the width the preview row bounds them at', () => {
    const long = 'x'.repeat(MAX_PREVIEW_TEXT_LENGTH + 1)
    expect(ImportProjectResult.safeParse(result({ path: long })).success).toBe(false)
    const explained = { outcome: 'failed', writtenProjectId: null, reasons: [long] }
    expect(ImportProjectResult.safeParse(result(explained)).success).toBe(false)
  })

  it('bounds the reason list the same way, so a hundred reasons cannot ride back on one row', () => {
    const many = Array.from({ length: MAX_PREVIEW_REASONS + 1 }, (_one, at) => `reason ${String(at)}`)
    const explained = { outcome: 'blocked', writtenProjectId: null, reasons: many }
    expect(ImportProjectResult.safeParse(result(explained)).success).toBe(false)
  })

  it('refuses a negative count, there being no such thing as minus one task written', () => {
    expect(ImportProjectResult.safeParse(result({ tasksRemoved: -1 })).success).toBe(false)
  })
})

describe('ImportConfirmResult', () => {
  it('names the session it applied and a row per project', () => {
    const parsed = ImportConfirmResult.parse({ sessionId: SESSION, projects: [result()] })
    expect([parsed.sessionId, parsed.projects.length]).toEqual([SESSION, 1])
  })

  it('takes a confirm that wrote nothing, a session whose every group was refused being one', () => {
    expect(ImportConfirmResult.parse({ sessionId: SESSION, projects: [] }).projects).toEqual([])
  })

  it('carries a success and a failure together, cross-project atomicity not being claimed', () => {
    const projects = [result(), result({ outcome: 'failed', writtenProjectId: null, reasons: ['no space'] })]
    const parsed = ImportConfirmResult.parse({ sessionId: SESSION, projects })
    expect(parsed.projects.map((one) => one.outcome)).toEqual(['created', 'failed'])
  })

  it('bounds the rows at the most projects this product will hold', () => {
    const many = Array.from({ length: LIMITS.projectsPerProduct + 1 }, () => result())
    expect(ImportConfirmResult.safeParse({ sessionId: SESSION, projects: many }).success).toBe(false)
  })
})
