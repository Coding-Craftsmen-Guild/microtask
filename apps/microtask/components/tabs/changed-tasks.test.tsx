import { describe, expect, it } from 'vitest'
import { markChanged, takeChanged } from './changed-tasks'

describe('the record of tasks this browser changed since their page was rendered', () => {
  it('answers false for a task nothing was marked on', () => {
    expect(takeChanged('never-touched')).toBe(false)
  })

  it('answers true once for a marked task, then forgets it', () => {
    markChanged('touched')
    expect(takeChanged('touched')).toBe(true)
    expect(takeChanged('touched')).toBe(false)
  })

  it('keeps one task’s mark off another task', () => {
    markChanged('one')
    expect(takeChanged('other')).toBe(false)
    expect(takeChanged('one')).toBe(true)
  })

  it('holds a task marked twice as one mark', () => {
    markChanged('twice')
    markChanged('twice')
    expect(takeChanged('twice')).toBe(true)
    expect(takeChanged('twice')).toBe(false)
  })
})
