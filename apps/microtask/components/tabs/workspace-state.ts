import type { Decoded } from '@repo/api-client'
import { emptyDocument, type DocumentValue, type ProgressValue, type Tab } from '@repo/contracts'

/** One tab as the page holds it: the API's own shape, document and stamp included. */
export type WorkspaceTab = Decoded<typeof Tab>

/** What the editor island mounts with. It reads both once, so changing them means a remount. */
export interface IslandSeed {
  /** The document the island opens on. */
  readonly document: DocumentValue

  /** The stamp its first write presents as `If-Match` (ADR 0016). */
  readonly updatedAt: string
}

/** Everything the task page's tab strip and editor are drawn from. */
export interface WorkspaceState {
  /** The task's tabs in order, each with the latest version this page knows of. */
  readonly tabs: readonly WorkspaceTab[]

  /** The open tab's id. */
  readonly active: string

  /** Bumped on every island mount; with {@link active} it is the island's key. */
  readonly mount: number

  /** What the island was mounted with. Deliberately not updated by the island's own saves. */
  readonly seed: IslandSeed

  /** The open tab's count as of its last edit, or `null` until one. */
  readonly live: ProgressValue | null

  /** Whether the next tabs from the server should remount the island on them. */
  readonly reloading: boolean
}

/** Every transition the page makes, each named for what happened rather than what to set. */
export type WorkspaceAction =
  | { readonly type: 'open'; readonly tabId: string }
  | { readonly type: 'saved'; readonly tabId: string; readonly document: DocumentValue; readonly updatedAt: string }
  | { readonly type: 'created'; readonly tab: WorkspaceTab }
  | { readonly type: 'renamed'; readonly tab: WorkspaceTab }
  | { readonly type: 'removed'; readonly tabId: string }
  | { readonly type: 'reordered'; readonly tabs: readonly WorkspaceTab[] }
  | { readonly type: 'progress'; readonly progress: ProgressValue }
  | { readonly type: 'reload' }
  | { readonly type: 'server'; readonly tabs: readonly WorkspaceTab[] }

type Handler<Type extends WorkspaceAction['type']> = (
  state: WorkspaceState,
  action: Extract<WorkspaceAction, { type: Type }>,
) => WorkspaceState

const opened = (state: WorkspaceState, tab: WorkspaceTab | undefined): WorkspaceState =>
  tab === undefined
    ? state
    : {
        ...state,
        active: tab.id,
        mount: state.mount + 1,
        seed: { document: tab.document, updatedAt: tab.updatedAt },
        live: null,
      }

const replaced = (tabs: readonly WorkspaceTab[], next: WorkspaceTab): readonly WorkspaceTab[] =>
  tabs.map((tab) => (tab.id === next.id ? next : tab))

const removed: Handler<'removed'> = (state, { tabId }) => {
  const index = state.tabs.findIndex((tab) => tab.id === tabId)
  if (index === -1) return state
  const tabs = state.tabs.filter((tab) => tab.id !== tabId)
  return opened({ ...state, tabs }, tabs[Math.max(0, index - 1)])
}

const renamed: Handler<'renamed'> = (state, { tab }) => {
  const next = { ...state, tabs: replaced(state.tabs, tab) }
  return tab.id === state.active ? opened(next, tab) : next
}

const fromServer: Handler<'server'> = (state, { tabs }) => {
  const next = { ...state, tabs, reloading: false }
  const active = tabs.find((tab) => tab.id === state.active)
  return state.reloading || active === undefined ? opened(next, active ?? tabs[0]) : next
}

const HANDLERS: { readonly [Type in WorkspaceAction['type']]: Handler<Type> } = {
  open: (state, { tabId }) => opened(state, state.tabs.find((tab) => tab.id === tabId)),
  saved: (state, { tabId, document, updatedAt }) => {
    const tab = state.tabs.find((one) => one.id === tabId)
    return tab === undefined ? state : { ...state, tabs: replaced(state.tabs, { ...tab, document, updatedAt }) }
  },
  created: (state, { tab }) => opened({ ...state, tabs: [...state.tabs, tab] }, tab),
  renamed,
  removed,
  reordered: (state, { tabs }) => ({ ...state, tabs }),
  progress: (state, { progress }) => ({ ...state, live: progress }),
  reload: (state) => ({ ...state, reloading: true }),
  server: fromServer,
}

/**
 * The page's one state transition.
 *
 * The island is keyed on the open tab **and** {@link WorkspaceState.mount}, and it reads its seed
 * on mount only. So a transition that must hand the island a different document or stamp — a
 * tab switch, a delete, a create, a rename of the open tab, a reload after a conflict — bumps
 * `mount`, and one that must not — its own save landing, a reorder — leaves both alone and the
 * editor keeps its caret. A rename is in the first group because it moves the tab's `updatedAt`,
 * and an island left on the old stamp would report its own next save as somebody else's.
 *
 * After a delete the page lands on the tab to the **left** of the one removed,
 * `max(0, index - 1)`, whichever tab was open — which is what the app being replaced did.
 */
export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  const handle = HANDLERS[action.type] as Handler<WorkspaceAction['type']>
  return handle(state, action)
}

/** The state a page opens in: the tab asked for, already validated, or the first. */
export function initialWorkspace(tabs: readonly WorkspaceTab[], activeId: string): WorkspaceState {
  const blank: WorkspaceState = {
    tabs,
    active: '',
    mount: 0,
    seed: { document: emptyDocument(), updatedAt: '' },
    live: null,
    reloading: false,
  }
  return opened(blank, tabs.find((tab) => tab.id === activeId) ?? tabs[0])
}
