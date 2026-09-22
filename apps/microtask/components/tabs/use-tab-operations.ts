'use client'

import type { TabRef, TaskRef } from '@repo/api-client'
import { useMemo } from 'react'
import type { ActionResult } from '../../actions/result'
import { eachOrNoAnswer } from '@repo/app-session/no-answer'
import { markChanged } from './changed-tasks'
import { movedOrder, type MoveDirection } from './reorder'
import { useNotice, type Notice } from './use-notice'
import type { Workspace } from './use-workspace'
import type { WorkspaceTab } from './workspace-state'

/**
 * The four structural writes, as the page is handed them.
 *
 * Props rather than imports, so the same components serve the admin surface — which passes the
 * Server Actions in `actions/tabs.ts`, reading `mt_admin` — and the client surface under `/s/*`,
 * which passes actions of its own, each bound to the token in the page's URL and taking it as
 * its credential; nothing there reads a cookie (ADR 0040).
 */
export interface TabActions {
  /** Creates a tab at the end of the task and answers it. */
  readonly create: (task: TaskRef, name: string) => Promise<ActionResult<WorkspaceTab>>

  /** Renames a tab and answers it, with the stamp the rename moved. */
  readonly rename: (tab: TabRef, name: string) => Promise<ActionResult<WorkspaceTab>>

  /** Deletes a tab. */
  readonly remove: (tab: TabRef) => Promise<ActionResult<null>>

  /** Renumbers the task's tabs and answers them in their new order. */
  readonly reorder: (task: TaskRef, tabIds: readonly string[]) => Promise<ActionResult<readonly WorkspaceTab[]>>
}

export type { Notice } from './use-notice'

/** What the strip, its menu and its dialogs call. */
export interface TabOperations {
  /** The latest notice, or `null`. */
  readonly notice: Notice | null

  /** Opens a tab, once any pending save on the open one has been written. */
  readonly select: (tabId: string) => Promise<void>

  /** Creates a tab and opens it. */
  readonly create: (name: string) => Promise<void>

  /** Renames a tab; an unchanged name sends nothing. */
  readonly rename: (tab: WorkspaceTab, name: string) => Promise<void>

  /** Deletes a tab and lands on the one to its left. */
  readonly remove: (tab: WorkspaceTab) => Promise<void>

  /** Moves a tab one step, as the full permutation `tabs.reorder` takes. */
  readonly move: (tab: WorkspaceTab, direction: MoveDirection) => Promise<void>
}

/** The text legacy toasted after a delete. */
export const TAB_DELETED = 'Tab deleted'

/** Why the open tab stayed open: leaving would remount the island and drop what it holds. */
export const TAB_HELD = 'This tab has edits that are not saved, so it stays open.'

/**
 * The structural writes, each ordered against the island so no edit is lost and none resurrects.
 *
 * Every write that leaves the open tab's content in place **awaits `flush` first**: switching,
 * creating, renaming and moving. Renaming the open tab needs it most, because the rename moves
 * the stamp the island's next save presents; flushing first means the island is remounted on the
 * renamed tab with nothing left unsaved.
 *
 * **Nothing remounts the island over edits it is holding.** A flush settles whether or not its
 * write landed, and a remount reads the server's document, so switching, creating, deleting
 * another tab or renaming the open one while a save is in conflict or waiting to retry would
 * drop the edits with nothing on screen to say so — in a conflict, a reload nobody chose
 * (ADR 0016). Each of those stays put and says why instead. A move and a rename of another tab
 * remount nothing, and go ahead.
 *
 * Deleting the **open** tab calls `markClean` **before** the delete, never `flush`, which is what
 * the app being replaced did for the reason it did: a queued autosave must not write into the
 * tab being deleted. Deleting another tab flushes the open one instead — legacy cleared its dirty
 * flag whichever tab was deleted, and so dropped the open tab's pending edit.
 *
 * The actions are called through `eachOrNoAnswer`, so one the server never answers is shown
 * under the strip as a refusal would be, and changes nothing on the page.
 */
export function useTabOperations(workspace: Workspace, given: TabActions, task: TaskRef): TabOperations {
  const { state, dispatch, editor } = workspace
  const actions = useMemo(() => eachOrNoAnswer(given), [given])
  const open = state.tabs.find((tab) => tab.id === state.active)
  const { notice, say, sayAbout } = useNotice(`${String(state.mount)}:${open?.updatedAt ?? ''}`)
  const flush = (): Promise<boolean> => editor.current?.flush() ?? Promise.resolve(true)
  const leave = async (): Promise<boolean> => {
    const left = await flush()
    if (!left) sayAbout({ tone: 'error', text: TAB_HELD })
    return left
  }
  const settle = <Value>(result: ActionResult<Value>, apply: (value: Value) => void, done?: string): void => {
    if (!result.ok) {
      say({ tone: 'error', text: result.detail })
      return
    }
    markChanged(task.taskId)
    apply(result.value)
    say(done === undefined ? null : { tone: 'done', text: done })
  }
  const refOf = (tab: WorkspaceTab): TabRef => ({ ...task, tabId: tab.id })
  return {
    notice,
    select: async (tabId) => {
      if (tabId === state.active || !(await leave())) return
      dispatch({ type: 'open', tabId })
    },
    create: async (name) => {
      if (!(await leave())) return
      settle(await actions.create(task, name), (tab) => dispatch({ type: 'created', tab }))
    },
    rename: async (tab, name) => {
      if (name === tab.name) return
      if (tab.id === state.active && !(await leave())) return
      settle(await actions.rename(refOf(tab), name), (next) => dispatch({ type: 'renamed', tab: next }))
    },
    remove: async (tab) => {
      if (tab.id === state.active) editor.current?.markClean()
      else if (!(await leave())) return
      settle(await actions.remove(refOf(tab)), () => dispatch({ type: 'removed', tabId: tab.id }), TAB_DELETED)
    },
    move: async (tab, direction) => {
      const order = movedOrder(state.tabs.map((one) => one.id), tab.id, direction)
      if (order === null) return
      await flush()
      settle(await actions.reorder(task, order), (tabs) => dispatch({ type: 'reordered', tabs }))
    },
  }
}
