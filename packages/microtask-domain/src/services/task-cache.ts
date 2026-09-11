import { MAX_LISTED_TAB_NAMES } from '@repo/contracts'
import type { Progress } from '../entities/progress.js'
import type { TaskEntry } from '../entities/manifest.js'
import type { TaskDocument } from '../entities/task.js'
import { countTabs } from '../progress.js'
import { inOrder } from './positions.js'

/**
 * The part of a manifest entry that is read from the task file rather than owned by the entry.
 *
 * Four fields, written by one operation, because an entry that refreshed three of them would be
 * a cache that looks current and is not — forgetting one is forgetting all four, which is what
 * makes the progress tests catch the other three (ADR 0034).
 */
export interface TaskCache {
  /** Checklist state summed over every tab of the task (ADR 0007). */
  readonly progress: Progress

  /** When the task file was last written, so a list row can say "updated 3h ago". */
  readonly updatedAt: string

  /** How many tabs the task holds, which is the honest total behind "+N more". */
  readonly tabCount: number

  /** The first {@link MAX_LISTED_TAB_NAMES} tab names, in position order. */
  readonly tabNames: readonly string[]
}

/** Reads a task file into the fields its manifest entry caches. */
export function taskCache(task: TaskDocument): TaskCache {
  const ordered = inOrder(task.tabs)
  return {
    progress: countTabs(task.tabs),
    updatedAt: task.updatedAt,
    tabCount: ordered.length,
    tabNames: ordered.slice(0, MAX_LISTED_TAB_NAMES).map((tab) => tab.name),
  }
}

const sameNames = (cached: readonly string[] | undefined, counted: readonly string[]): boolean =>
  cached !== undefined &&
  cached.length === counted.length &&
  cached.every((name, index) => name === counted[index])

/**
 * Whether an entry's cache still matches what its task file says.
 *
 * An absent field never matches, so a hand-edited manifest missing one is recomputed on read of
 * that task rather than read as zero (ADR 0007). The entry is taken as a partially-trusted
 * record for the same reason: it is stored JSON, and the only thing that makes it true is this
 * comparison.
 */
export function cacheAgrees(entry: TaskEntry, counted: TaskCache): boolean {
  return (
    entry.progress !== undefined &&
    entry.progress.done === counted.progress.done &&
    entry.progress.total === counted.progress.total &&
    entry.updatedAt === counted.updatedAt &&
    entry.tabCount === counted.tabCount &&
    sameNames(entry.tabNames, counted.tabNames)
  )
}
