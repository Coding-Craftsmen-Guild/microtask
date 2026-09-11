'use client'

import { useState } from 'react'
import type { TabRef, TaskRef } from '@repo/api-client'
import type { ActionResult } from '../../actions/result'
import { markChanged } from './changed-tasks'
import { movedOrder, type MoveDirection } from './reorder'
import type { Workspace } from './use-workspace'
import type { WorkspaceTab } from './workspace-state'

/**
 * The four structural writes, as the page is handed them.
 *
 * Props rather than imports, so the same components serve the admin surface — which passes the
 * Server Actions in `actions/tabs.ts`, reading `mt_admin` — and the client surface under `/s/*`,
 * which must pass actions of its own that read `mt_link` (ADR 0032).
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

/** One line under the strip: what a write was refused with, or what it did. */
export interface Notice {
  /** `error` is read out as an alert; `done` politely. */
  readonly tone: 'error' | 'done'

  /** The sentence itself. */
  readonly text: string
}

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

/**
 * The structural writes, each ordered against the island so no edit is lost and none resurrects.
 *
 * Every write that leaves the open tab's content in place **awaits `flush` first**: switching,
 * creating, renaming and moving. Renaming the open tab needs it most, because the rename moves
 * the stamp the island's next save presents; flushing first means the island is remounted on the
 * renamed tab with nothing left unsaved.
 *
 * Deleting the **open** tab calls `markClean` **before** the delete, never `flush`, which is what
 * the app being replaced did for the reason it did: a queued autosave must not write into the
 * tab being deleted. Deleting another tab flushes the open one instead — legacy cleared its dirty
 * flag whichever tab was deleted, and so dropped the open tab's pending edit.
 */
export function useTabOperations(workspace: Workspace, actions: TabActions, task: TaskRef): TabOperations {
  const { state, dispatch, editor } = workspace
  const [notice, setNotice] = useState<Notice | null>(null)
  const flush = (): Promise<void> => editor.current?.flush() ?? Promise.resolve()
  const settle = <Value>(result: ActionResult<Value>, apply: (value: Value) => void, done?: string): void => {
    if (!result.ok) {
      setNotice({ tone: 'error', text: result.detail })
      return
    }
    markChanged(task.taskId)
    apply(result.value)
    setNotice(done === undefined ? null : { tone: 'done', text: done })
  }
  const refOf = (tab: WorkspaceTab): TabRef => ({ ...task, tabId: tab.id })
  return {
    notice,
    select: async (tabId) => {
      if (tabId === state.active) return
      await flush()
      dispatch({ type: 'open', tabId })
    },
    create: async (name) => {
      await flush()
      settle(await actions.create(task, name), (tab) => dispatch({ type: 'created', tab }))
    },
    rename: async (tab, name) => {
      if (name === tab.name) return
      if (tab.id === state.active) await flush()
      settle(await actions.rename(refOf(tab), name), (next) => dispatch({ type: 'renamed', tab: next }))
    },
    remove: async (tab) => {
      if (tab.id === state.active) editor.current?.markClean()
      else await flush()
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
