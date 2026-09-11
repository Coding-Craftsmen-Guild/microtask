import { describe, expect, it } from 'vitest'
import { capabilities, CAPABILITY_ACTIONS, type ScopeValue } from '@repo/contracts'
import { ADMIN_CAPABILITIES } from '../shared/admin-capabilities'
import { tabControls } from './tab-controls'
import { activeTabId } from './active-tab'
import { emptyProgressText } from './tab-copy'

const PROJECT = '01M240ERCRWWCN16Q5AHP1FZAQ'
const TASK = '01M240FB4GD6PF6V0PKZVF6FD9'
const TASK_SCOPE: ScopeValue = { kind: 'task', projectId: PROJECT, taskId: TASK }
const PROJECT_SCOPE: ScopeValue = { kind: 'project', projectId: PROJECT }

describe('tabControls reads the tab controls off capabilities, never off a role', () => {
  it('gives the admin every tab control', () => {
    expect(tabControls(ADMIN_CAPABILITIES)).toEqual({
      create: true,
      rename: true,
      remove: true,
      reorder: true,
      write: true,
    })
  })

  it('gives a view link no tab control and no editor', () => {
    expect(tabControls(capabilities('view', TASK_SCOPE))).toEqual({
      create: false,
      rename: false,
      remove: false,
      reorder: false,
      write: false,
    })
  })

  it('gives a write link add, rename and write, but neither delete nor move', () => {
    expect(tabControls(capabilities('write', TASK_SCOPE))).toEqual({
      create: true,
      rename: true,
      remove: false,
      reorder: false,
      write: true,
    })
  })

  it('gives a task-scoped manage link every tab control, as a project-scoped one has', () => {
    const expected = { create: true, rename: true, remove: true, reorder: true, write: true }
    expect(tabControls(capabilities('manage', TASK_SCOPE))).toEqual(expected)
    expect(tabControls(capabilities('manage', PROJECT_SCOPE))).toEqual(expected)
  })
})

describe('tabControls reads each control off its own action', () => {
  const only = (action: 'tab:create' | 'tab:rename' | 'tab:delete' | 'tab:reorder' | 'tab:write') => ({
    ...Object.fromEntries(CAPABILITY_ACTIONS.map((one) => [one, false])),
    [action]: true,
  }) as typeof ADMIN_CAPABILITIES

  it.each([
    ['tab:create', 'create'],
    ['tab:rename', 'rename'],
    ['tab:delete', 'remove'],
    ['tab:reorder', 'reorder'],
    ['tab:write', 'write'],
  ] as const)('turns on only the control %s decides', (action, control) => {
    const controls = tabControls(only(action))
    expect(Object.entries(controls).filter(([, on]) => on)).toEqual([[control, true]])
  })
})

describe('activeTabId validates ?tab= against the task’s own tabs', () => {
  const tabs = [{ id: 'first' }, { id: 'second' }, { id: 'third' }]

  it('honours a tab the task holds', () => {
    expect(activeTabId(tabs, 'second')).toBe('second')
  })

  it('falls back to the first tab for an id the task does not hold', () => {
    expect(activeTabId(tabs, 'another-task-tab')).toBe('first')
  })

  it('falls back to the first tab when no tab was asked for', () => {
    expect(activeTabId(tabs, undefined)).toBe('first')
  })

  it('refuses a repeated ?tab= rather than choosing between the copies', () => {
    expect(activeTabId(tabs, ['third', 'second'])).toBe('first')
  })

  it('answers null for a task with no tabs, which the domain never stores', () => {
    expect(activeTabId([], 'second')).toBeNull()
  })
})

describe('emptyProgressText is legacy’s exact copy for a tab with no checklist items', () => {
  it('says the admin’s sentence on the admin surface', () => {
    expect(emptyProgressText('admin', true)).toBe('No checklist items in this tab')
  })

  it('says the write link’s sentence to a link that can edit', () => {
    expect(emptyProgressText('link', true)).toBe('No checklist items yet')
  })

  it('says the read link’s sentence to a link that cannot', () => {
    expect(emptyProgressText('link', false)).toBe('Nothing to tick here')
  })
})
