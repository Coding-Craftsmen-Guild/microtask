import { describe, expect, it } from 'vitest'
import {
  BADGE_BASE,
  CHOICE_LABEL,
  PREVIEW_LABEL,
  PREVIEW_TONE,
  RESULT_LABEL,
  RESULT_TONE,
  remintNotice,
  scopeLabel,
  taskCountLabel,
} from './outcomes'
import type { TransferGroup } from './vocabulary'

const group = (over: Partial<TransferGroup> = {}): TransferGroup => ({
  path: 'volume/projects/01HZ',
  shape: 'v2-project-directory',
  projectId: null,
  name: '',
  manifestTaskCount: 0,
  taskFilesFound: 0,
  shareLinks: [],
  existsInTarget: false,
  outcome: 'importable',
  reasons: [],
  ...over,
})

describe('remintNotice', () => {
  it('gives the sentence §7.4 and ADR 0019 both quote, word for word, at a plural count', () => {
    expect(remintNotice(3)).toBe(
      "3 share links will get new URLs; the existing project's links keep working.",
    )
  })

  it('does not say "1 share links", which substituting into the ADR template would produce', () => {
    expect(remintNotice(1)).toBe(
      "1 share link will get a new URL; the existing project's links keep working.",
    )
  })

  it('still says what happens when the colliding group asserts no links at all', () => {
    expect(remintNotice(0)).toBe(
      "No share links will get new URLs; the existing project's links keep working.",
    )
  })

  it('never varies the second clause, which is the half the ADR fixed', () => {
    const tails = [0, 1, 3, 50].map((count) => remintNotice(count).split('; ')[1])
    expect(new Set(tails).size).toBe(1)
    expect(tails[0]).toBe("the existing project's links keep working.")
  })
})

describe('taskCountLabel', () => {
  it('reads differently for no manifest at all than for a manifest naming zero tasks', () => {
    const absent = taskCountLabel(group({ manifestTaskCount: null, taskFilesFound: 0 }))
    const zero = taskCountLabel(group({ manifestTaskCount: 0, taskFilesFound: 0 }))
    expect(absent).not.toBe(zero)
    expect(absent).toBe('No manifest · 0 task files found')
    expect(zero).toBe('0 in manifest · 0 found')
  })

  it('states both halves of ADR 0018’s cross-check, so a mismatch is readable rather than implied', () => {
    expect(taskCountLabel(group({ manifestTaskCount: 9, taskFilesFound: 7 }))).toBe(
      '9 in manifest · 7 found',
    )
  })

  it('does not say "1 task files" for the manifest-less group that carries exactly one', () => {
    expect(taskCountLabel(group({ manifestTaskCount: null, taskFilesFound: 1 }))).toBe(
      'No manifest · 1 task file found',
    )
  })
})

describe('scopeLabel', () => {
  it('names the task a task-scoped link reaches, which is the containment check’s subject', () => {
    expect(scopeLabel({ kind: 'task', projectId: '01P', taskId: '01T' })).toBe('task 01T')
  })

  it('names the project a project-scoped link reaches', () => {
    expect(scopeLabel({ kind: 'project', projectId: '01P' })).toBe('project 01P')
  })
})

describe('the outcome vocabulary', () => {
  it('paints skipped unlike either failure, because it is the admin’s choice and not a refusal', () => {
    expect(RESULT_TONE.skipped).not.toBe(RESULT_TONE.failed)
    expect(RESULT_TONE.skipped).not.toBe(RESULT_TONE.blocked)
    expect(RESULT_TONE.skipped).not.toContain('destructive')
  })

  it('gives all five confirm outcomes paint that differs past the shared badge geometry', () => {
    const tails = Object.values(RESULT_TONE).map((tone) => tone.slice(BADGE_BASE.length))
    expect(new Set(tails).size).toBe(5)
  })

  it('gives the three preview outcomes distinct paint and distinct words', () => {
    expect(new Set(Object.values(PREVIEW_TONE)).size).toBe(3)
    expect(new Set(Object.values(PREVIEW_LABEL)).size).toBe(3)
  })

  it('builds every badge on the one shared geometry, so no tone can drop the shape', () => {
    for (const tone of [...Object.values(PREVIEW_TONE), ...Object.values(RESULT_TONE)]) {
      expect(tone.startsWith(BADGE_BASE), tone).toBe(true)
    }
  })

  it('has a distinct word for each confirm outcome and each conflict choice', () => {
    expect(new Set(Object.values(RESULT_LABEL)).size).toBe(5)
    expect(new Set(Object.values(CHOICE_LABEL)).size).toBe(3)
  })
})
