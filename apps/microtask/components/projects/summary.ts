import type { ProgressValue } from '@repo/contracts'

/** Anything that sits at a position in an order. */
export interface Positioned {
  /** Its id. */
  readonly id: string
  /** Where it sits, dense from zero within its group. */
  readonly position: number
}

/** A task as a list row needs it: where it sits and its cached progress. */
export interface ListedTask extends Positioned {
  /** The folder it is filed in, or `null` at the project root. */
  readonly folderId: string | null
  /** Its cached checklist count (ADR 0007). */
  readonly progress: ProgressValue
}

/** `1 tab`, `2 tabs` — the count-and-noun the app being replaced wrote into every row. */
export const plural = (count: number, noun: string): string =>
  `${String(count)} ${noun}${count === 1 ? '' : 's'}`

/**
 * The counts half of a row's metadata line: `3 tabs · 2 share links`.
 *
 * The share-links clause is omitted at zero, exactly as it was, and also when the count is
 * `undefined` — a caller refused `share:read` is told nothing, and "0 share links" would be a
 * claim rather than an absence (ADR 0033). The `· updated …` half is rendered by the row, so
 * the instant stays in a `time` element.
 */
export function countsLine(count: number, noun: string, shareLinks: number | undefined): string {
  const counted = plural(count, noun)
  return shareLinks === undefined || shareLinks === 0
    ? counted
    : `${counted} · ${plural(shareLinks, 'share link')}`
}

/**
 * The checklist count of several tasks, summed from each entry's cached progress.
 *
 * A list view may read the cache and never the documents — that is the whole reason the
 * manifest carries it (ADR 0007, ADR 0034). No document is in hand here, so there is none to walk.
 */
export function progressOf(tasks: readonly ListedTask[]): ProgressValue {
  return tasks.reduce(
    (sum, task) => ({ done: sum.done + task.progress.done, total: sum.total + task.progress.total }),
    { done: 0, total: 0 },
  )
}

/**
 * Tasks in the order the project page draws them: by folder, then by position within it, with
 * the project root last.
 *
 * A task naming a folder that does not exist sorts with the root rather than vanishing, so a
 * hand-edited manifest shows every task it holds.
 */
export function inTreeOrder<Task extends ListedTask>(
  folders: readonly Positioned[],
  tasks: readonly Task[],
): Task[] {
  const rank = new Map(folders.map((folder) => [folder.id, folder.position]))
  const groupOf = (task: Task): number =>
    (task.folderId === null ? undefined : rank.get(task.folderId)) ?? Number.POSITIVE_INFINITY
  return [...tasks].sort((a, b) => groupOf(a) - groupOf(b) || a.position - b.position)
}
