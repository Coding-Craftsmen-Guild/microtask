import { describe, expect, it } from 'vitest'
import { overallProgress } from './overall'
import type { WorkspaceTab } from './workspace-state'

const tab = (id: string, checked: readonly boolean[]): WorkspaceTab => ({
  id,
  name: id,
  position: 0,
  createdAt: 'S0',
  updatedAt: 'S1',
  document: {
    type: 'doc',
    content: [
      { type: 'taskList', content: checked.map((on) => ({ type: 'taskItem', attrs: { checked: on }, content: [{ type: 'paragraph' }] })) },
    ],
  },
})

const TABS = [tab('a', [true, false]), tab('b', []), tab('c', [true, true, true])]

describe('overallProgress, the task-wide count the title row shows', () => {
  it('sums every tab’s stored document while the open one has no edit yet', () => {
    expect(overallProgress(TABS, 'a', null)).toEqual({ done: 4, total: 5 })
  })

  it('takes the open tab’s live count in place of its stored one, so the bar follows typing', () => {
    expect(overallProgress(TABS, 'a', { done: 2, total: 4 })).toEqual({ done: 5, total: 7 })
  })

  it('counts the live figure for whichever tab is open, and the stored figure for every other', () => {
    expect(overallProgress(TABS, 'c', { done: 0, total: 1 })).toEqual({ done: 1, total: 3 })
  })

  it('is zero of zero for a task with no checklist items anywhere', () => {
    expect(overallProgress([tab('a', []), tab('b', [])], 'a', null)).toEqual({ done: 0, total: 0 })
  })
})
