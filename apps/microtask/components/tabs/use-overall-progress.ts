'use client'

import { useMemo } from 'react'
import { countTasks } from '@repo/contracts'
import { usePublishProgress } from './live-progress'
import { overallProgress } from './overall'
import type { WorkspaceState } from './workspace-state'

/**
 * Publishes the task-wide count to the title row on every change (`overallProgress`).
 *
 * The other tabs are counted once per change to the tab list and the open tab, not on every
 * keystroke: a task holds up to forty tabs of up to 2 MB each, and only the open one's count moves
 * while the user types.
 */
export function useOverallProgress({ tabs, active, live }: WorkspaceState): void {
  const others = useMemo(() => overallProgress(tabs.filter((tab) => tab.id !== active), active, null), [tabs, active])
  const open = tabs.find((tab) => tab.id === active)
  const stored = useMemo(() => (open === undefined ? { done: 0, total: 0 } : countTasks(open.document)), [open])
  const current = live ?? stored
  usePublishProgress({ done: others.done + current.done, total: others.total + current.total })
}
