import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useImperativeHandle, useState } from 'react'
import { capabilities, LIMITS, type Capabilities, type ProgressValue } from '@repo/contracts'
import type { DocumentEditorProps } from '../editor/document-editor'
import type { SaveOutcome } from '../editor/save-document'
import { ADMIN_CAPABILITIES } from './tab-controls'
import type { TabActions } from './use-tab-operations'
import type { WorkspaceTab } from './workspace-state'

interface Mounted {
  readonly document: DocumentEditorProps['document']
  readonly updatedAt: string
  readonly editable: boolean
}

const log: string[] = []
const mounts: Mounted[] = []
let island: DocumentEditorProps | null = null
let flushGate: Promise<void> = Promise.resolve()

vi.mock('../editor/document-editor', () => ({
  DocumentEditor: (props: DocumentEditorProps) => {
    island = props
    useImperativeHandle(props.ref, () => ({
      flush: () => {
        log.push('flush')
        return flushGate
      },
      markClean: () => {
        log.push('markClean')
      },
    }))
    useState(() => {
      mounts.push({ document: props.document, updatedAt: props.updatedAt, editable: props.editable })
      log.push(`mount:${props.updatedAt}`)
    })
    return <div data-testid="island" />
  },
}))

const router = { refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const { TaskWorkspace } = await import('./task-workspace')

const P = '01M240ERCRWWCN16Q5AHP1FZAQ'
let taskSerial = 0
let T = ''

const doc = (checked: readonly boolean[]) => ({
  type: 'doc' as const,
  content: [
    {
      type: 'taskList',
      content: checked.map((on) => ({ type: 'taskItem', attrs: { checked: on }, content: [{ type: 'paragraph' }] })),
    },
  ],
})

const tab = (id: string, position: number, checked: readonly boolean[] = [], updatedAt = `${id}-S1`): WorkspaceTab => ({
  id,
  name: `Tab ${id}`,
  position,
  document: doc(checked),
  createdAt: 'S0',
  updatedAt,
})

const TABS = [tab('a', 0, [true, false]), tab('b', 1), tab('c', 2, [true, true, true])]

const ok = <Value,>(value: Value) => Promise.resolve({ ok: true as const, value })

let actions: { [Key in keyof TabActions]: ReturnType<typeof vi.fn> & TabActions[Key] }

interface Options {
  readonly tabs?: readonly WorkspaceTab[]
  readonly active?: string
  readonly allowed?: Capabilities
  readonly audience?: 'admin' | 'link'
}

const workspace = (options: Options = {}) => (
  <TaskWorkspace
    actions={actions}
    audience={options.audience ?? 'admin'}
    capabilities={options.allowed ?? ADMIN_CAPABILITIES}
    documentRoot={`/api/projects/${P}/tasks/${T}/tabs`}
    initialTabId={options.active ?? 'a'}
    tabs={options.tabs ?? TABS}
    task={{ projectId: P, taskId: T }}
  />
)

const mount = (options: Options = {}) => render(workspace(options))

const tabNamed = (name: string): HTMLElement =>
  screen.getByRole('tab', { name: new RegExp(`^Tab ${name}`), hidden: true })

const strip = (): HTMLElement => screen.getByRole('tablist')

const menuItem = (name: string): HTMLElement => screen.getByRole('menuitem', { name })

const settle = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
  })
}

let replaced: string[]
let pushed: number

beforeEach(() => {
  taskSerial += 1
  T = `01M240FB4GD6PF6V0PKZVF6F${String(taskSerial).padStart(2, '0')}`
  log.length = 0
  mounts.length = 0
  island = null
  flushGate = Promise.resolve()
  router.refresh.mockReset()
  actions = {
    create: vi.fn(),
    rename: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
  } as typeof actions
  window.history.replaceState(null, '', `/p/${P}/t/${T}`)
  replaced = []
  pushed = 0
  vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, url) => {
    replaced.push(String(url))
  })
  vi.spyOn(window.history, 'pushState').mockImplementation(() => {
    pushed += 1
  })
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the tab strip', () => {
  it('draws one tab per tab, in order', () => {
    mount()
    expect(within(strip()).getAllByRole('tab').map((one) => one.textContent)).toEqual([
      'Tab a1/2▾',
      'Tab b',
      'Tab c3/3',
    ])
  })

  it('marks the open tab selected, gives it the caret and the Tab options title', () => {
    mount({ active: 'b' })
    expect(tabNamed('b').getAttribute('aria-selected')).toBe('true')
    expect(tabNamed('b').getAttribute('title')).toBe('Tab options')
    expect(tabNamed('b').textContent).toContain('▾')
    expect(tabNamed('a').getAttribute('aria-selected')).toBe('false')
    expect(tabNamed('a').getAttribute('title')).toBe('Open Tab a')
    expect(tabNamed('a').textContent).not.toContain('▾')
  })

  it('draws no count pill on a tab with no checklist items', () => {
    mount()
    expect(tabNamed('b').querySelector('[data-slot="tab-count"]')).toBeNull()
  })
})

describe('?tab= in the address bar', () => {
  it('is written on mount with replaceState when the address lacked it', () => {
    mount({ active: 'c' })
    expect(replaced.at(-1)).toBe(`/p/${P}/t/${T}?tab=c`)
    expect(pushed).toBe(0)
  })

  it('is left alone on mount when the address already names the open tab', () => {
    vi.mocked(window.history.replaceState).mockRestore()
    window.history.replaceState(null, '', `/p/${P}/t/${T}?tab=a`)
    vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, url) => {
      replaced.push(String(url))
    })
    mount({ active: 'a' })
    expect(replaced).toEqual([])
  })

  it('replaces the ?tab= the address carries on a switch, rather than adding a second one', async () => {
    vi.mocked(window.history.replaceState).mockRestore()
    window.history.replaceState(null, '', `/p/${P}/t/${T}?tab=a#notes`)
    vi.spyOn(window.history, 'replaceState').mockImplementation((_data, _unused, url) => {
      replaced.push(String(url))
    })
    mount({ active: 'a' })
    await userEvent.click(tabNamed('c'))
    expect(replaced).toEqual([`/p/${P}/t/${T}?tab=c#notes`])
  })

  it('is rewritten with replaceState on every switch, and pushState is never used', async () => {
    mount()
    await userEvent.click(tabNamed('c'))
    expect(replaced.at(-1)).toBe(`/p/${P}/t/${T}?tab=c`)
    expect(pushed).toBe(0)
  })
})

describe('switching tabs', () => {
  it('flushes the open tab’s pending save before the island opens the next tab', async () => {
    mount()
    await userEvent.click(tabNamed('b'))
    expect(log).toEqual(['mount:a-S1', 'flush', 'mount:b-S1'])
    expect(tabNamed('b').getAttribute('aria-selected')).toBe('true')
  })

  it('keeps the old tab open until a slow flush settles', async () => {
    let open: () => void = () => undefined
    flushGate = new Promise<void>((resolve) => {
      open = resolve
    })
    mount()
    await userEvent.click(tabNamed('b'))
    expect(tabNamed('a').getAttribute('aria-selected')).toBe('true')
    expect(mounts).toHaveLength(1)
    await act(async () => {
      open()
      await flushGate
    })
    expect(tabNamed('b').getAttribute('aria-selected')).toBe('true')
    expect(mounts.at(-1)?.updatedAt).toBe('b-S1')
  })

  it('opens the island on the version its last save landed, not the one the page loaded with', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ updatedAt: 'a-S2' })))
    vi.stubGlobal('fetch', fetch)
    mount()
    const typed = doc([true, true])
    let outcome: SaveOutcome | undefined
    await act(async () => {
      outcome = await island?.save({ document: typed, ifMatch: 'a-S1', keepalive: false })
    })
    expect(outcome).toEqual({ kind: 'saved', updatedAt: 'a-S2' })
    expect(fetch).toHaveBeenCalledWith(`/api/projects/${P}/tasks/${T}/tabs/a/document`, expect.anything())
    await userEvent.click(tabNamed('b'))
    await userEvent.click(tabNamed('a'))
    expect(mounts.at(-1)).toEqual({ document: typed, updatedAt: 'a-S2', editable: true })
  })

  it('writes to the tab it is open on after a switch, not to the tab the page opened on', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ updatedAt: 'b-S2' })))
    vi.stubGlobal('fetch', fetch)
    mount()
    await userEvent.click(tabNamed('b'))
    await act(async () => {
      await island?.save({ document: doc([true]), ifMatch: 'b-S1', keepalive: false })
    })
    expect(fetch).toHaveBeenCalledWith(`/api/projects/${P}/tasks/${T}/tabs/b/document`, expect.anything())
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not switch when the open tab is clicked, and opens its menu instead', async () => {
    mount()
    await userEvent.click(tabNamed('a'))
    expect(log).toEqual(['mount:a-S1'])
    expect(menuItem('Rename')).toBeTruthy()
  })
})

describe('the tab strip keeps its DOM and its scroll while the user types', () => {
  it('patches the open tab’s count in place, leaving every tab element the same node', async () => {
    mount()
    const before = within(strip()).getAllByRole('tab')
    const scroller = strip().parentElement
    if (scroller === null) throw new Error('no scroller')
    scroller.scrollLeft = 120
    await act(async () => {
      island?.onProgress?.({ done: 2, total: 2 } satisfies ProgressValue)
    })
    const after = within(strip()).getAllByRole('tab')
    expect(after).toHaveLength(before.length)
    after.forEach((node, index) => expect(node).toBe(before[index]))
    expect(tabNamed('a').textContent).toContain('2/2')
    expect(scroller.scrollLeft).toBe(120)
  })

  it('patches only the open tab’s pill, leaving every other tab its own count', async () => {
    mount()
    await act(async () => {
      island?.onProgress?.({ done: 0, total: 5 })
    })
    expect(tabNamed('a').textContent).toContain('0/5')
    expect(tabNamed('c').textContent).toContain('3/3')
    expect(tabNamed('b').querySelector('[data-slot="tab-count"]')).toBeNull()
  })

  it('scrolls the open tab into view when it changes, nearest on both axes', async () => {
    mount()
    const scroll = vi.mocked(Element.prototype.scrollIntoView)
    scroll.mockClear()
    await userEvent.click(tabNamed('c'))
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    expect(scroll.mock.contexts.at(-1)).toBe(tabNamed('c'))
  })

  it('does not scroll on a keystroke, so a strip the user scrolled stays where they left it', async () => {
    mount()
    const scroll = vi.mocked(Element.prototype.scrollIntoView)
    scroll.mockClear()
    await act(async () => {
      island?.onProgress?.({ done: 1, total: 3 })
    })
    expect(scroll).not.toHaveBeenCalled()
  })
})

describe('the tab menu', () => {
  it('opens on a right-click of any tab, suppressing the browser’s own, without switching', () => {
    mount()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => {
      tabNamed('c').dispatchEvent(event)
    })
    expect(event.defaultPrevented).toBe(true)
    expect(tabNamed('a').getAttribute('aria-selected')).toBe('true')
    expect(menuItem('Move right').getAttribute('aria-disabled')).toBe('true')
    expect(menuItem('Move left').getAttribute('aria-disabled')).toBeNull()
  })

  it('disables Move left on the first tab', async () => {
    mount()
    await userEvent.click(tabNamed('a'))
    expect(menuItem('Move left').getAttribute('aria-disabled')).toBe('true')
    expect(menuItem('Move right').getAttribute('aria-disabled')).toBeNull()
  })

  it('disables Delete tab when the task has one tab', async () => {
    mount({ tabs: [tab('a', 0)] })
    await userEvent.click(tabNamed('a'))
    expect(menuItem('Delete tab').getAttribute('aria-disabled')).toBe('true')
  })
})

describe('moving a tab', () => {
  it('sends the whole order to tabs.reorder after a flush, and draws the order it answers', async () => {
    const ordered = [TABS[1], TABS[0], TABS[2]] as WorkspaceTab[]
    actions.reorder.mockReturnValue(ok(ordered))
    mount()
    await userEvent.click(tabNamed('a'))
    await userEvent.click(menuItem('Move right'))
    await settle()
    expect(actions.reorder).toHaveBeenCalledWith({ projectId: P, taskId: T }, ['b', 'a', 'c'])
    expect(log).toEqual(['mount:a-S1', 'flush'])
    expect(within(strip()).getAllByRole('tab').map((one) => one.textContent?.slice(0, 5))).toEqual([
      'Tab b',
      'Tab a',
      'Tab c',
    ])
    expect(mounts).toHaveLength(1)
  })

  it('moves a tab left by swapping it with its left neighbour', async () => {
    actions.reorder.mockReturnValue(ok(TABS))
    mount({ active: 'c' })
    await userEvent.click(tabNamed('c'))
    await userEvent.click(menuItem('Move left'))
    await settle()
    expect(actions.reorder).toHaveBeenCalledWith({ projectId: P, taskId: T }, ['a', 'c', 'b'])
  })

  it('clears a refusal once a later write succeeds', async () => {
    actions.reorder
      .mockReturnValueOnce(Promise.resolve({ ok: false, status: 409, detail: 'This list changed.' }))
      .mockReturnValueOnce(ok([TABS[1], TABS[0], TABS[2]] as WorkspaceTab[]))
    mount()
    await userEvent.click(tabNamed('a'))
    await userEvent.click(menuItem('Move right'))
    await settle()
    expect(screen.getByRole('alert').textContent).toBe('This list changed.')
    await userEvent.click(tabNamed('a'))
    await userEvent.click(menuItem('Move right'))
    await settle()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the sentence a refused reorder came back with', async () => {
    actions.reorder.mockReturnValue(Promise.resolve({ ok: false, status: 409, detail: 'This list changed.' }))
    mount()
    await userEvent.click(tabNamed('a'))
    await userEvent.click(menuItem('Move right'))
    await settle()
    expect(screen.getByRole('alert').textContent).toBe('This list changed.')
  })
})

describe('deleting a tab', () => {
  const confirmDelete = async (name: string) => {
    await userEvent.click(tabNamed(name))
    await userEvent.click(menuItem('Delete tab'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(`Delete “Tab ${name}”?`)).toBeTruthy()
    expect(within(dialog).getByText('Everything written in this tab is deleted. This cannot be undone.')).toBeTruthy()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete tab' }))
    await settle()
  }

  it('drops the open tab’s pending save before the delete is sent, and never flushes it', async () => {
    actions.remove.mockImplementation(() => {
      log.push('remove')
      return ok(null)
    })
    mount({ active: 'b' })
    await confirmDelete('b')
    expect(log.slice(0, 3)).toEqual(['mount:b-S1', 'markClean', 'remove'])
    expect(log).not.toContain('flush')
    expect(actions.remove).toHaveBeenCalledWith({ projectId: P, taskId: T, tabId: 'b' })
  })

  it('lands on the tab to the left of the deleted one, not the first', async () => {
    actions.remove.mockReturnValue(ok(null))
    mount({ active: 'c' })
    await confirmDelete('c')
    expect(within(strip()).getAllByRole('tab')).toHaveLength(2)
    expect(tabNamed('b').getAttribute('aria-selected')).toBe('true')
    expect(mounts.at(-1)?.updatedAt).toBe('b-S1')
    expect(screen.getByRole('status').textContent).toBe('Tab deleted')
  })

  it('flushes the open tab, rather than dropping its edit, when another tab is deleted', async () => {
    actions.remove.mockImplementation(() => {
      log.push('remove')
      return ok(null)
    })
    mount({ active: 'a' })
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    act(() => {
      tabNamed('c').dispatchEvent(event)
    })
    await userEvent.click(menuItem('Delete tab'))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete tab' }))
    await settle()
    expect(log.slice(0, 3)).toEqual(['mount:a-S1', 'flush', 'remove'])
    expect(log).not.toContain('markClean')
  })

  it('keeps the tab and shows the refusal when the delete is refused', async () => {
    actions.remove.mockReturnValue(Promise.resolve({ ok: false, status: 422, detail: 'A task must keep at least one tab' }))
    mount({ active: 'b' })
    await confirmDelete('b')
    expect(within(strip()).getAllByRole('tab')).toHaveLength(3)
    expect(screen.getByRole('alert').textContent).toBe('A task must keep at least one tab')
  })

  it('focuses nothing a keypress could confirm, so Enter cannot delete a tab', async () => {
    mount({ active: 'b' })
    await userEvent.click(tabNamed('b'))
    await userEvent.click(menuItem('Delete tab'))
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete tab' })
    expect(document.activeElement).not.toBe(confirm)
    await userEvent.keyboard('{Enter}')
    await settle()
    expect(actions.remove).not.toHaveBeenCalled()
  })

  it('sends nothing when the confirmation is cancelled', async () => {
    mount({ active: 'b' })
    await userEvent.click(tabNamed('b'))
    await userEvent.click(menuItem('Delete tab'))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(actions.remove).not.toHaveBeenCalled()
    expect(log).not.toContain('markClean')
  })
})

describe('renaming a tab', () => {
  const rename = async (name: string, value: string) => {
    await userEvent.click(tabNamed(name))
    await userEvent.click(menuItem('Rename'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Rename tab')).toBeTruthy()
    const field = within(dialog).getByRole('textbox')
    expect((field as HTMLInputElement).value).toBe(`Tab ${name}`)
    await userEvent.clear(field)
    await userEvent.type(field, value)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    await settle()
  }

  it('flushes the open tab, renames it, and remounts the island on the stamp the rename moved', async () => {
    actions.rename.mockImplementation(() => {
      log.push('rename')
      return ok({ ...TABS[0], name: 'Go-live', updatedAt: 'a-S2' } as WorkspaceTab)
    })
    mount()
    await rename('a', 'Go-live')
    expect(actions.rename).toHaveBeenCalledWith({ projectId: P, taskId: T, tabId: 'a' }, 'Go-live')
    expect(log).toEqual(['mount:a-S1', 'flush', 'rename', 'mount:a-S2'])
    expect(screen.getByRole('tab', { name: /^Go-live/ })).toBeTruthy()
  })

  it('returns focus to the tab when its menu is dismissed', async () => {
    mount()
    await userEvent.click(tabNamed('a'))
    await userEvent.keyboard('{Escape}')
    await settle()
    expect(document.activeElement).toBe(tabNamed('a'))
  })

  it('renames a tab that is not open without touching the island', async () => {
    actions.rename.mockReturnValue(ok({ ...TABS[2], name: 'Done', updatedAt: 'c-S2' } as WorkspaceTab))
    mount()
    act(() => {
      tabNamed('c').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    await userEvent.click(menuItem('Rename'))
    const field = within(screen.getByRole('dialog')).getByRole('textbox')
    await userEvent.clear(field)
    await userEvent.type(field, 'Done{Enter}')
    await settle()
    expect(log).toEqual(['mount:a-S1'])
    expect(screen.getByRole('tab', { name: /^Done/ })).toBeTruthy()
  })

  it('sends nothing for a name identical to the current one', async () => {
    mount()
    await rename('a', 'Tab a')
    expect(actions.rename).not.toHaveBeenCalled()
  })
})

describe('creating a tab', () => {
  it('prompts, flushes, creates, and opens the tab the server answered', async () => {
    actions.create.mockImplementation(() => {
      log.push('create')
      return ok(tab('d', 3, [], 'd-S1'))
    })
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'New tab' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('New tab')).toBeTruthy()
    const field = within(dialog).getByRole('textbox')
    expect(field.getAttribute('placeholder')).toBe('Client tasks')
    await userEvent.type(field, 'Client tasks')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
    await settle()
    expect(actions.create).toHaveBeenCalledWith({ projectId: P, taskId: T }, 'Client tasks')
    expect(log).toEqual(['mount:a-S1', 'flush', 'create', 'mount:d-S1'])
    expect(tabNamed('d').getAttribute('aria-selected')).toBe('true')
    expect(replaced.at(-1)).toBe(`/p/${P}/t/${T}?tab=d`)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('disables + at the tab limit from LIMITS, and not before it', () => {
    const many = Array.from({ length: LIMITS.tabsPerTask }, (_, index) => tab(`t${String(index)}`, index))
    const { unmount } = mount({ tabs: many, active: 't0' })
    expect(screen.getByRole('button', { name: 'New tab' }).hasAttribute('disabled')).toBe(true)
    unmount()
    mount({ tabs: many.slice(1), active: 't1' })
    expect(screen.getByRole('button', { name: 'New tab' }).hasAttribute('disabled')).toBe(false)
  })
})

describe('controls follow capabilities, never a role', () => {
  const TASK_SCOPE = () => ({ kind: 'task' as const, projectId: P, taskId: T })

  it('gives a view link no +, no menu, no caret, a read-only editor, and the browser’s right-click', async () => {
    mount({ allowed: capabilities('view', TASK_SCOPE()), audience: 'link' })
    expect(screen.queryByRole('button', { name: 'New tab' })).toBeNull()
    expect(tabNamed('a').textContent).not.toContain('▾')
    expect(tabNamed('a').hasAttribute('title')).toBe(false)
    await userEvent.click(tabNamed('a'))
    expect(screen.queryByRole('menu')).toBeNull()
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    tabNamed('b').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(mounts[0]?.editable).toBe(false)
  })

  it('gives a write link + and Rename, but neither Move nor Delete', async () => {
    mount({ allowed: capabilities('write', TASK_SCOPE()), audience: 'link' })
    expect(screen.getByRole('button', { name: 'New tab' })).toBeTruthy()
    await userEvent.click(tabNamed('a'))
    expect(menuItem('Rename')).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Move left' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Delete tab' })).toBeNull()
    expect(mounts[0]?.editable).toBe(true)
  })

  it('gives a task-scoped manage link every tab control', async () => {
    mount({ allowed: capabilities('manage', TASK_SCOPE()), audience: 'link' })
    await userEvent.click(tabNamed('a'))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Rename',
      'Move left',
      'Move right',
      'Delete tab',
    ])
  })
})

describe('the open tab’s progress row', () => {
  const row = (): HTMLElement => {
    const found = document.querySelector<HTMLElement>('[data-slot="tab-progress"]')
    if (found === null) throw new Error('no progress row')
    return found
  }

  it('reads the tab name and done / total completed', () => {
    mount()
    expect(row().textContent).toContain('Tab a')
    expect(row().textContent).toContain('1 / 2 completed')
  })

  it('follows the island’s live count as the user types', async () => {
    mount()
    await act(async () => {
      island?.onProgress?.({ done: 2, total: 2 })
    })
    expect(row().textContent).toContain('2 / 2 completed')
  })

  it('says the admin sentence for a tab with no checklist items, and still draws a bar', () => {
    mount({ active: 'b' })
    expect(row().textContent).toContain('No checklist items in this tab')
    expect(row().querySelector('[data-slot="progress-bar-fill"]')).not.toBeNull()
  })

  it('says the write link sentence to a link that can edit, and draws no bar', () => {
    mount({ active: 'b', audience: 'link', allowed: capabilities('write', { kind: 'task', projectId: P, taskId: T }) })
    expect(row().textContent).toContain('No checklist items yet')
    expect(row().querySelector('[data-slot="progress-bar-fill"]')).toBeNull()
  })

  it('draws the bar for a link once the tab has checklist items', () => {
    mount({ active: 'a', audience: 'link', allowed: capabilities('write', { kind: 'task', projectId: P, taskId: T }) })
    expect(row().querySelector('[data-slot="progress-bar-fill"]')).not.toBeNull()
  })

  it('says the read link sentence to a link that cannot', () => {
    mount({ active: 'b', audience: 'link', allowed: capabilities('view', { kind: 'task', projectId: P, taskId: T }) })
    expect(row().textContent).toContain('Nothing to tick here')
  })
})

describe('reloading after a conflict', () => {
  it('drops the edits, refreshes, and remounts the island on what the server answers', async () => {
    const { rerender } = mount()
    act(() => island?.onReload())
    expect(log).toContain('markClean')
    expect(router.refresh).toHaveBeenCalledTimes(1)
    const fresh = [{ ...TABS[0], document: doc([false]), updatedAt: 'a-S9' }, TABS[1], TABS[2]] as WorkspaceTab[]
    rerender(workspace({ tabs: fresh }))
    expect(mounts.at(-1)).toEqual({ document: doc([false]), updatedAt: 'a-S9', editable: true })
  })

  it('takes fresh tabs without remounting the island when no reload was asked for', () => {
    const { rerender } = mount()
    rerender(workspace({ tabs: TABS.map((one) => ({ ...one, name: `${one.name}!` })) }))
    expect(mounts).toHaveLength(1)
    expect(screen.getByRole('tab', { name: /^Tab a!/ })).toBeTruthy()
  })
})

describe('returning to a page Next restored from its Back/Forward cache', () => {
  it('refreshes and remounts when this browser saved the task since the payload was rendered', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ updatedAt: 'a-S2' })))
    const first = mount()
    await act(async () => {
      await island?.save({ document: doc([true, true]), ifMatch: 'a-S1', keepalive: false })
    })
    first.unmount()
    expect(router.refresh).not.toHaveBeenCalled()
    const second = mount()
    expect(router.refresh).toHaveBeenCalledTimes(1)
    const fresh = [{ ...TABS[0], document: doc([true, true]), updatedAt: 'a-S2' }, TABS[1], TABS[2]] as WorkspaceTab[]
    second.rerender(workspace({ tabs: fresh }))
    expect(mounts.at(-1)?.updatedAt).toBe('a-S2')
  })

  it('refreshes after a structural change too, which a save stamp would not reveal', async () => {
    actions.remove.mockReturnValue(ok(null))
    const first = mount({ active: 'b' })
    await userEvent.click(tabNamed('b'))
    await userEvent.click(menuItem('Delete tab'))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete tab' }))
    await settle()
    first.unmount()
    mount()
    expect(router.refresh).toHaveBeenCalledTimes(1)
  })

  it('does not refresh a page this browser has not changed', () => {
    mount()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('does not refresh on a failed save, which changed nothing', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 409 })))
    const first = mount()
    await act(async () => {
      await island?.save({ document: doc([true]), ifMatch: 'a-S1', keepalive: false })
    })
    first.unmount()
    mount()
    expect(router.refresh).not.toHaveBeenCalled()
  })
})

describe('keyboard', () => {
  it('opens a tab from the keyboard, since each tab is a real button', async () => {
    mount()
    tabNamed('b').focus()
    await userEvent.keyboard('{Enter}')
    await settle()
    expect(tabNamed('b').getAttribute('aria-selected')).toBe('true')
  })

  it('draws the island once per mount rather than on every keystroke', async () => {
    mount()
    for (const done of [0, 1, 2]) {
      await act(async () => {
        island?.onProgress?.({ done, total: 2 })
      })
    }
    expect(mounts).toHaveLength(1)
  })
})
