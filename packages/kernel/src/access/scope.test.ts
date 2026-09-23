import { describe, expect, it } from 'vitest'
import { isProjectScope, type Scope } from './scope.js'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240ERCRWWCN16Q5AHP1FZT1'
const PLAN = '01M240ERCRWWCN16Q5AHP1FZN1'

describe('isProjectScope', () => {
  it('admits both Microtask roots, a project and a task inside one', () => {
    expect(isProjectScope({ kind: 'project', projectId: PROJECT })).toBe(true)
    expect(isProjectScope({ kind: 'task', projectId: PROJECT, taskId: TASK })).toBe(true)
  })

  it('refuses a plan, which carries no projectId for a Microtask consumer to read', () => {
    expect(isProjectScope({ kind: 'plan', planId: PLAN })).toBe(false)
  })

  it('refuses a kind it was not written for, which is why it enumerates rather than excluding plan', () => {
    const later = { kind: 'portfolio', portfolioId: PROJECT } as unknown as Scope
    expect(isProjectScope(later)).toBe(false)
  })
})
