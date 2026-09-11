import { describe, expect, it } from 'vitest'
import { scopedToTask, taskChoices } from './task-share'

const P = '01HZZZZZZZZZZZZZZZZZZZZZP1'
const T = '01HZZZZZZZZZZZZZZZZZZZZZT1'

describe('scopedToTask', () => {
  it('holds for a link scoped to this task', () => {
    expect(scopedToTask({ kind: 'task', projectId: P, taskId: T }, T)).toBe(true)
  })

  it('does not hold for a link scoped to another task', () => {
    expect(scopedToTask({ kind: 'task', projectId: P, taskId: 'OTHER' }, T)).toBe(false)
  })

  it('does not hold for a project-scoped link, which the project page manages', () => {
    expect(scopedToTask({ kind: 'project', projectId: P }, T)).toBe(false)
  })
})

describe('taskChoices', () => {
  it('offers this task and nothing wider', () => {
    expect(taskChoices(P, { id: T, name: 'Go-live' })).toEqual([
      { value: T, label: 'Go-live', scope: { kind: 'task', projectId: P, taskId: T } },
    ])
  })
})
