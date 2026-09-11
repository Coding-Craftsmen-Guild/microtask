import { describe, expect, it } from 'vitest'
import { MAX_LISTED_TAB_NAMES } from '@repo/contracts'
import type { DocumentJson } from '../entities/document.js'
import type { TaskEntry } from '../entities/manifest.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import { taskEntry, STAMP } from '../testing/fixtures.js'
import { cacheAgrees, taskCache } from './task-cache.js'

const TASK = '01M240ERCRWWCN16Q5AHP1FZAB'
const EDITED = '2026-09-11T09:00:00.000Z'

const checklist = (done: number, total: number): DocumentJson => ({
  type: 'doc',
  content: Array.from({ length: total }, (_, index) => ({
    type: 'taskItem',
    attrs: { checked: index < done },
  })),
})

const tab = (name: string, position: number, document: DocumentJson): Tab => ({
  id: `01M240ERCRWWCN16Q5AHP1FZB${position.toString(36).toUpperCase()}`,
  name,
  position,
  document,
  createdAt: STAMP,
  updatedAt: STAMP,
})

const task = (tabs: readonly Tab[], updatedAt = EDITED): TaskDocument => ({
  id: TASK,
  tabs,
  createdAt: STAMP,
  updatedAt,
})

const named = (count: number): readonly Tab[] =>
  Array.from({ length: count }, (_, index) => tab(`Tab ${String(index)}`, index, checklist(0, 0)))

describe('taskCache reads a task file into the fields its manifest entry caches (ADR 0034)', () => {
  it('sums progress across every tab, which is the grain the manifest caches at', () => {
    const cached = taskCache(task([tab('Go-live', 0, checklist(1, 2)), tab('General', 1, checklist(2, 4))]))
    expect(cached.progress).toEqual({ done: 3, total: 6 })
  })

  it('takes updatedAt from the task file rather than from a clock', () => {
    expect(taskCache(task(named(1))).updatedAt).toBe(EDITED)
    expect(taskCache(task(named(1), STAMP)).updatedAt).toBe(STAMP)
  })

  it('reports the true total and only the first eight names, so a 12-tab task says "+4 more"', () => {
    const cached = taskCache(task(named(12)))
    expect(cached.tabCount).toBe(12)
    expect(cached.tabNames).toHaveLength(MAX_LISTED_TAB_NAMES)
    expect(cached.tabNames).toEqual(['Tab 0', 'Tab 1', 'Tab 2', 'Tab 3', 'Tab 4', 'Tab 5', 'Tab 6', 'Tab 7'])
  })

  it('names every tab when there are eight or fewer, so the cap is not a truncation of the small case', () => {
    expect(taskCache(task(named(MAX_LISTED_TAB_NAMES))).tabNames).toHaveLength(MAX_LISTED_TAB_NAMES)
    expect(taskCache(task(named(3))).tabNames).toEqual(['Tab 0', 'Tab 1', 'Tab 2'])
  })

  it('names them in position order, not in the order a hand-edited file happens to list them', () => {
    const shuffled = [tab('Third', 2, checklist(0, 0)), tab('First', 0, checklist(0, 0)), tab('Second', 1, checklist(0, 0))]
    expect(taskCache(task(shuffled)).tabNames).toEqual(['First', 'Second', 'Third'])
  })

  it('counts a task with no tabs as nothing, rather than throwing', () => {
    expect(taskCache(task([]))).toEqual({
      progress: { done: 0, total: 0 },
      updatedAt: EDITED,
      tabCount: 0,
      tabNames: [],
    })
  })
})

describe('cacheAgrees decides whether a read has to correct the entry (ADR 0007)', () => {
  const document = task([tab('General', 0, checklist(1, 3))])
  const current = taskCache(document)
  const fresh = (): TaskEntry => taskEntry(TASK, 'Ship it', current)

  it('agrees when every cached field matches the file', () => {
    expect(cacheAgrees(fresh(), current)).toBe(true)
  })

  it.each([
    ['progress', { progress: { done: 0, total: 3 } }],
    ['updatedAt', { updatedAt: STAMP }],
    ['tabCount', { tabCount: 2 }],
    ['tabNames', { tabNames: ['Renamed'] }],
  ] as const)('disagrees when %s alone is stale, so forgetting one is forgetting all four', (_field, stale) => {
    expect(cacheAgrees({ ...fresh(), ...stale }, current)).toBe(false)
  })

  it('never agrees with an entry missing the cache, so a hand-edited manifest is recomputed', () => {
    const uncached = { id: TASK, name: 'Ship it', position: 0, folderId: null } as TaskEntry
    expect(cacheAgrees(uncached, current)).toBe(false)
  })

  it('compares names element by element, not by length', () => {
    expect(cacheAgrees({ ...fresh(), tabNames: ['Genera'] }, current)).toBe(false)
  })
})
