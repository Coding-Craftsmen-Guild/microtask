import { compareSort, type PlanColumn, type SortDirection } from './columns'
import type { TableRow } from './rows'

/** Which column the table is ordered by, and which way. `null` is the plan's own derived order. */
export interface Sorted {
  readonly column: string
  readonly direction: SortDirection
}

/** What a reader has narrowed the table to: a needle, a rail, and a group. */
export interface Narrowed {
  /** Lower-cased already, because every row's search key is. */
  readonly needle: string

  /** A rail id, or `''` for every rail. */
  readonly rail: string

  /** A label id, `'none'` for the ungrouped, or `''` for every group. */
  readonly group: string
}

/**
 * The narrowing the filters can still say: a rail or a group the plan no longer holds let go of.
 *
 * The two filters are uncontrolled selects, and a select whose chosen option leaves it — the rail or the
 * group was deleted — reads as its first option, which is every rail or every group. Narrowing by the id
 * that left would hide every row under a filter that says it hides none. So the table narrows by this, and
 * keeps it: an id let go of is not taken up again if it comes back, as the select would not either.
 *
 * @param narrowed - What the reader narrowed to.
 * @param plan - The plan's rails and groups, which are the options the two filters offer.
 * @returns The very same narrowing when both filters are still on offer, or one that lets go of the other.
 */
export function narrowingIn(
  narrowed: Narrowed,
  plan: { readonly epics: readonly { readonly id: string }[]; readonly labels: readonly { readonly id: string }[] },
): Narrowed {
  const rail = narrowed.rail === '' || plan.epics.some((one) => one.id === narrowed.rail) ? narrowed.rail : ''
  const offered = narrowed.group === '' || narrowed.group === 'none' || plan.labels.some((one) => one.id === narrowed.group)
  const group = offered ? narrowed.group : ''
  return rail === narrowed.rail && group === narrowed.group ? narrowed : { ...narrowed, rail, group }
}

/** One row as the table draws it: the row, and whether the search and the filters leave it hidden. */
export interface ArrangedRow {
  readonly row: TableRow
  readonly hidden: boolean
}

const blocksOf = (rows: readonly TableRow[]): ReadonlyMap<string, readonly TableRow[]> => {
  const blocks = new Map<string, TableRow[]>()
  for (const row of rows) {
    const block = blocks.get(row.block)
    if (block === undefined) blocks.set(row.block, [row])
    else block.push(row)
  }
  return blocks
}

const inGroup = (row: TableRow, group: string): boolean => {
  if (group === '') return true
  return group === 'none' ? row.labelId === null : row.labelId === group
}

const kept = (row: TableRow, narrowed: Narrowed): boolean =>
  row.search.includes(narrowed.needle) && (narrowed.rail === '' || row.railId === narrowed.rail) && inGroup(row, narrowed.group)

const narrowedBlock = (rows: readonly TableRow[], narrowed: Narrowed): readonly ArrangedRow[] => {
  const head = rows[0]
  const whole = head !== undefined && kept(head, narrowed)
  const shown = new Set(rows.filter((row) => kept(row, narrowed)))
  if (!whole && head !== undefined && shown.size > 0) shown.add(head)
  return rows.map((row) => ({ row, hidden: !whole && !shown.has(row) }))
}

const sortKeyOf = (row: TableRow | undefined, column: string): string => {
  const sort = row?.sort ?? null
  if (sort === null || !(column in sort)) return ''
  return String(sort[column as keyof typeof sort])
}

/**
 * The table's rows in the order to draw them, each marked shown or hidden — the search, the two filters
 * and the sort, answered in render.
 *
 * ### Why a block is the unit
 *
 * A feature and its items are one piece of work. The two filters are properties of a **feature** — a rail
 * and a group — so an item has no separate answer and is kept or dropped with the feature it flows under.
 * Search is the exception: a block whose **feature row** matched is shown whole, and otherwise only the
 * item rows that matched, under their feature row for context, so a result is never an orphan.
 *
 * A sort is a reader asking a question for a moment, so it moves whole blocks and never separates an item
 * from its feature: within a block the derived order is untouched, and clearing the sort restores it
 * exactly, `Array.prototype.sort` being stable.
 *
 * ### Why it is not done to the DOM any more
 *
 * It was: rows were hidden, re-appended and their cells moved by hand after **every** render, because the
 * server always drew the default order. The table is drawn in the browser now (ADR 0069), so the order is
 * simply the order it is rendered in — and the old way would have fought React for those very nodes.
 * A filtered row is still rendered and `hidden`, which is what takes it out of the accessibility tree.
 *
 * @param rows - Every row, in the plan's derived order (`./rows.ts`).
 * @param narrowed - The search and the filters.
 * @param sorted - The sort, or `null` for the derived order.
 * @returns Every row, in the order to draw them, each marked.
 */
export function arrangedRows(rows: readonly TableRow[], narrowed: Narrowed, sorted: Sorted | null): readonly ArrangedRow[] {
  const blocks = blocksOf(rows)
  const keys = [...blocks.keys()]
  if (sorted !== null) {
    const keyOf = (block: string): string => sortKeyOf(blocks.get(block)?.[0], sorted.column)
    keys.sort((left, right) => compareSort(keyOf(left), keyOf(right), sorted.column, sorted.direction))
  }
  return keys.flatMap((key) => narrowedBlock(blocks.get(key) ?? [], narrowed))
}

/**
 * The columns on offer, in the reader's order; a remembered key naming a column not on offer is skipped.
 *
 * @param offered - The columns this viewer's table has.
 * @param order - The order the reader chose, by key.
 * @returns The offered columns, in that order.
 */
export const orderedColumns = (offered: readonly PlanColumn[], order: readonly string[]): readonly PlanColumn[] =>
  order.flatMap((key) => offered.filter((column) => column.key === key))

/**
 * The sort one more click on a column produces: ascending, then descending, then none at all.
 *
 * The third click clears it rather than cycling back to ascending, so the order the canvas draws the plan
 * in — which `rows.ts` says is the order that matters — is always one click away and is reachable by the
 * same gesture that left it.
 */
export function nextSort(sorted: Sorted | null, column: string): Sorted | null {
  if (sorted === null || sorted.column !== column) return { column, direction: 'asc' }
  return sorted.direction === 'asc' ? { column, direction: 'desc' } : null
}
