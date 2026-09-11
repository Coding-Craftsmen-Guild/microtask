import { describe, expect, it } from 'vitest'
import { initialWorkspace, workspaceReducer, type WorkspaceState, type WorkspaceTab } from './workspace-state'

const doc = (text: string) => ({ type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

const tab = (id: string, position: number, updatedAt = 'S1'): WorkspaceTab => ({
  id,
  name: `Tab ${id}`,
  position,
  document: doc(id),
  createdAt: 'S0',
  updatedAt,
})

const TABS = [tab('a', 0), tab('b', 1), tab('c', 2), tab('d', 3)]

const at = (active: string): WorkspaceState => initialWorkspace(TABS, active)

describe('initialWorkspace', () => {
  it('opens the tab asked for and seeds the island with that tab’s document and stamp', () => {
    const state = at('c')
    expect(state.active).toBe('c')
    expect(state.seed).toEqual({ document: doc('c'), updatedAt: 'S1' })
    expect(state.live).toBeNull()
  })

  it('opens the first tab when the one asked for is not in the list', () => {
    expect(at('zz').active).toBe('a')
  })
})

describe('opening a tab', () => {
  it('remounts the island on the new tab’s seed and forgets the old tab’s live count', () => {
    const before = workspaceReducer(at('a'), { type: 'progress', progress: { done: 1, total: 2 } })
    const after = workspaceReducer(before, { type: 'open', tabId: 'b' })
    expect(after.active).toBe('b')
    expect(after.mount).toBe(before.mount + 1)
    expect(after.seed).toEqual({ document: doc('b'), updatedAt: 'S1' })
    expect(after.live).toBeNull()
  })

  it('ignores a tab id the list does not hold', () => {
    const state = at('b')
    expect(workspaceReducer(state, { type: 'open', tabId: 'zz' })).toBe(state)
  })
})

describe('a save landing', () => {
  it('records the saved document and stamp on that tab, without remounting the island', () => {
    const state = at('b')
    const after = workspaceReducer(state, { type: 'saved', tabId: 'b', document: doc('typed'), updatedAt: 'S2' })
    expect(after.tabs[1]).toMatchObject({ id: 'b', document: doc('typed'), updatedAt: 'S2' })
    expect(after.mount).toBe(state.mount)
    expect(after.seed).toEqual(state.seed)
  })

  it('records a save for a tab that is no longer active, which is what the unmount flush lands as', () => {
    const state = at('c')
    const after = workspaceReducer(state, { type: 'saved', tabId: 'a', document: doc('late'), updatedAt: 'S9' })
    expect(after.tabs[0]).toMatchObject({ id: 'a', document: doc('late'), updatedAt: 'S9' })
    expect(after.active).toBe('c')
  })
})

describe('deleting a tab', () => {
  it('lands on the tab to the left of the deleted one, not the first', () => {
    const after = workspaceReducer(at('c'), { type: 'removed', tabId: 'c' })
    expect(after.tabs.map((one) => one.id)).toEqual(['a', 'b', 'd'])
    expect(after.active).toBe('b')
  })

  it('lands on the new first tab when the first was deleted', () => {
    const after = workspaceReducer(at('a'), { type: 'removed', tabId: 'a' })
    expect(after.active).toBe('b')
  })

  it('lands on the new last tab when the last was deleted', () => {
    const after = workspaceReducer(at('d'), { type: 'removed', tabId: 'd' })
    expect(after.active).toBe('c')
  })

  it('lands left of the deleted tab even when another tab was active, as legacy did', () => {
    const after = workspaceReducer(at('a'), { type: 'removed', tabId: 'd' })
    expect(after.active).toBe('c')
  })

  it('remounts the island on the tab it lands on', () => {
    const state = at('c')
    const after = workspaceReducer(state, { type: 'removed', tabId: 'c' })
    expect(after.mount).toBe(state.mount + 1)
    expect(after.seed).toEqual({ document: doc('b'), updatedAt: 'S1' })
  })

  it('ignores a tab id the list does not hold', () => {
    const state = at('c')
    expect(workspaceReducer(state, { type: 'removed', tabId: 'zz' })).toBe(state)
  })
})

describe('creating a tab', () => {
  it('appends the created tab and opens it', () => {
    const created = tab('e', 4, 'S5')
    const after = workspaceReducer(at('b'), { type: 'created', tab: created })
    expect(after.tabs.map((one) => one.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(after.active).toBe('e')
    expect(after.seed).toEqual({ document: created.document, updatedAt: 'S5' })
  })
})

describe('renaming a tab', () => {
  it('replaces the tab with the one the server stored', () => {
    const after = workspaceReducer(at('a'), { type: 'renamed', tab: { ...tab('c', 2, 'S3'), name: 'Go-live' } })
    expect(after.tabs[2]).toMatchObject({ id: 'c', name: 'Go-live', updatedAt: 'S3' })
  })

  it('leaves the island alone when the renamed tab is not the active one', () => {
    const state = at('a')
    const after = workspaceReducer(state, { type: 'renamed', tab: { ...tab('c', 2, 'S3'), name: 'Go-live' } })
    expect(after.mount).toBe(state.mount)
  })

  it('remounts the island on the new stamp when the renamed tab is active, so its next save is not a 409', () => {
    const state = at('c')
    const after = workspaceReducer(state, { type: 'renamed', tab: { ...tab('c', 2, 'S3'), name: 'Go-live' } })
    expect(after.mount).toBe(state.mount + 1)
    expect(after.seed.updatedAt).toBe('S3')
  })
})

describe('reordering', () => {
  it('takes the order the server answered and keeps the active tab and the island', () => {
    const state = at('b')
    const after = workspaceReducer(state, {
      type: 'reordered',
      tabs: [tab('b', 0), tab('a', 1), tab('c', 2), tab('d', 3)],
    })
    expect(after.tabs.map((one) => one.id)).toEqual(['b', 'a', 'c', 'd'])
    expect(after.active).toBe('b')
    expect(after.mount).toBe(state.mount)
  })
})

describe('the live count', () => {
  it('holds the island’s latest count for the active tab', () => {
    const after = workspaceReducer(at('a'), { type: 'progress', progress: { done: 2, total: 5 } })
    expect(after.live).toEqual({ done: 2, total: 5 })
  })
})

describe('fresh tabs from the server', () => {
  it('replaces the tabs and keeps the island mounted when no reload was asked for', () => {
    const state = at('b')
    const after = workspaceReducer(state, { type: 'server', tabs: [tab('a', 0, 'S7'), tab('b', 1, 'S7')] })
    expect(after.tabs.map((one) => one.updatedAt)).toEqual(['S7', 'S7'])
    expect(after.mount).toBe(state.mount)
    expect(after.seed).toEqual(state.seed)
  })

  it('remounts the active tab on the fresh document when a reload was asked for', () => {
    const reloading = workspaceReducer(at('b'), { type: 'reload' })
    expect(reloading.reloading).toBe(true)
    const fresh = { ...tab('b', 1, 'S7'), document: doc('theirs') }
    const after = workspaceReducer(reloading, { type: 'server', tabs: [tab('a', 0), fresh] })
    expect(after.mount).toBe(reloading.mount + 1)
    expect(after.seed).toEqual({ document: doc('theirs'), updatedAt: 'S7' })
    expect(after.reloading).toBe(false)
  })

  it('opens the first tab when the active one is gone from the fresh list', () => {
    const state = at('d')
    const after = workspaceReducer(state, { type: 'server', tabs: [tab('a', 0, 'S7'), tab('b', 1)] })
    expect(after.active).toBe('a')
    expect(after.mount).toBe(state.mount + 1)
  })
})
