import { countTasks, type ProgressValue } from '@repo/contracts'
import type { WorkspaceTab } from './workspace-state'

/**
 * The task-wide count the title row shows: every tab's stored document, with the open tab's live
 * count in place of its own once the user has edited it — which is what makes the bar follow
 * typing, as the app being replaced re-rendered its header on every keystroke (parity feature 16).
 */
export function overallProgress(
  tabs: readonly WorkspaceTab[],
  active: string,
  live: ProgressValue | null,
): ProgressValue {
  return tabs.reduce<ProgressValue>(
    (sum, tab) => {
      const count = tab.id === active && live !== null ? live : countTasks(tab.document)
      return { done: sum.done + count.done, total: sum.total + count.total }
    },
    { done: 0, total: 0 },
  )
}
