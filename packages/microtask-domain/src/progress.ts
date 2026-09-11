import { countTasks } from '@repo/contracts'
import type { Progress } from './entities/progress.js'
import type { Tab } from './entities/tab.js'

export { MAX_DOCUMENT_DEPTH } from './limits.js'
export { countTasks } from '@repo/contracts'

/**
 * Counts a whole task, since the manifest caches progress per task rather than per tab
 * (ADR 0007). A task with no tabs counts as nothing done out of nothing.
 */
export function countTabs(tabs: readonly Tab[]): Progress {
  let done = 0
  let total = 0
  for (const tab of tabs) {
    const counted = countTasks(tab.document)
    done += counted.done
    total += counted.total
  }
  return { done, total }
}

/**
 * Whether a cached count still matches what the document says.
 *
 * A cache that is absent never matches, so a hand-edited manifest missing one is recomputed on
 * read rather than read as zero (ADR 0007).
 */
export function agreesWith(cached: Progress | undefined, counted: Progress): boolean {
  return cached !== undefined && cached.done === counted.done && cached.total === counted.total
}
