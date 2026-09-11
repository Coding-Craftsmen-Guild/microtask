'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ActionResult } from '../../actions/result'
import { eachOrNoAnswer } from '../shared/no-answer'
import type { TreeControls } from './controls'
import type { RowFolder, RowTask, TreeActions } from './types'

/** What every part of the tree reads: whose project, what may be drawn, and how to write. */
export interface TreeScope {
  /** The project the tree belongs to. */
  readonly projectId: string
  /** Every folder, unfiltered, for "Move to" and for folder order. */
  readonly folders: readonly RowFolder[]
  /** Every task, unfiltered, so a move is computed against the whole group and not the visible part. */
  readonly tasks: readonly RowTask[]
  /** Which controls to draw. */
  readonly controls: TreeControls
  /** The writes. */
  readonly actions: TreeActions
  /** The instant the page was rendered. */
  readonly now: number
  /** Share links scoped to each task, by task id; `undefined` when the caller was not told. */
  readonly linkCounts: Readonly<Record<string, number>> | undefined
}

/** The scope, plus one place to report a failed write. */
export interface TreeState extends TreeScope {
  /** Shows a write's refusal where the tree shows problems, or clears it on success. */
  readonly report: (result: ActionResult<unknown>) => void
  /** Runs one write and reports it, answering whether it succeeded. */
  readonly run: (write: () => Promise<ActionResult<unknown>>) => Promise<boolean>
  /** The last refusal, or `''`. */
  readonly problem: string
}

const Tree = createContext<TreeState | null>(null)

/** Props for {@link TreeProvider}. */
export interface TreeProviderProps {
  /** What the tree reads. */
  scope: TreeScope
  /** The tree. */
  children: ReactNode
}

/**
 * Holds the tree's shared facts and its one problem line.
 *
 * One line rather than one per row, because a move or a reorder fails for the whole tree's
 * reason — somebody else changed it — and the answer is the same wherever it was clicked.
 *
 * The actions are handed on guarded by `eachOrNoAnswer`, and every write in the tree goes through
 * them, so one the server never answers is shown as failed wherever in the tree it was sent from.
 */
export function TreeProvider({ scope, children }: TreeProviderProps) {
  const [problem, setProblem] = useState('')
  const actions = useMemo(() => eachOrNoAnswer(scope.actions), [scope.actions])
  const report = useCallback((result: ActionResult<unknown>) => {
    setProblem(result.ok ? '' : result.detail)
  }, [])
  const run = useCallback(
    async (write: () => Promise<ActionResult<unknown>>) => {
      const result = await write()
      report(result)
      return result.ok
    },
    [report],
  )
  const state = useMemo(() => ({ ...scope, actions, report, run, problem }), [scope, actions, report, run, problem])
  return <Tree.Provider value={state}>{children}</Tree.Provider>
}

/** Reads the tree's shared state; only a component inside {@link TreeProvider} may ask. */
export function useTree(): TreeState {
  const state = useContext(Tree)
  if (state === null) throw new Error('useTree outside a TreeProvider')
  return state
}

/** The ids of one folder group's tasks, in position order, from the whole unfiltered list. */
export const groupIds = (tasks: readonly RowTask[], folderId: string | null): string[] =>
  tasks
    .filter((task) => task.folderId === folderId)
    .sort((a, b) => a.position - b.position)
    .map((task) => task.id)
