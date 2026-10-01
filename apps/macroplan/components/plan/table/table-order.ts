import { compareSort, type SortDirection } from './columns'

const ROW = 'tr[data-block]'

const HEAD_ROW = 'thead tr'

/** Which column the table is ordered by, and which way. `null` is the plan's own derived order. */
export interface Sorted {
  readonly column: string
  readonly direction: SortDirection
}

/** What a reader has narrowed the table to: a needle, a rail, and a group. */
export interface Narrowed {
  /** Lower-cased already, because every row's `data-search` is. */
  readonly needle: string

  /** A rail id, or `''` for every rail. */
  readonly rail: string

  /** A label id, `'none'` for the ungrouped, or `''` for every group. */
  readonly group: string
}

const attr = (element: Element, name: string): string => element.getAttribute(name) ?? ''

const blocksIn = (body: Element): ReadonlyMap<string, readonly Element[]> => {
  const blocks = new Map<string, Element[]>()
  for (const row of body.querySelectorAll(ROW)) {
    const key = attr(row, 'data-block')
    blocks.set(key, [...(blocks.get(key) ?? []), row])
  }
  return blocks
}

const inGroup = (row: Element, group: string): boolean => {
  if (group === '') return true
  const held = attr(row, 'data-label-id')
  return group === 'none' ? held === '' : held === group
}

const kept = (row: Element, narrowed: Narrowed): boolean =>
  attr(row, 'data-search').includes(narrowed.needle) &&
  (narrowed.rail === '' || attr(row, 'data-rail') === narrowed.rail) &&
  inGroup(row, narrowed.group)

/**
 * Hides every row the search and the filters exclude, a block at a time.
 *
 * ### Why a block is the unit
 *
 * A feature and its items are one piece of work. The two filters are properties of a **feature** — a rail
 * and a group — so an item has no separate answer and is kept or dropped with the feature it flows under.
 *
 * Search is the exception, and behaves as the rail tree's does: a block whose **feature row** matched is
 * shown whole, and otherwise only the item rows that matched, under their feature row for context. A list
 * of matching items with no feature above them would be a list of orphans that nothing on screen could
 * place — `sidebar/sidebar-search.tsx` makes the same call about a rail and its features.
 *
 * `hidden` is the attribute rather than a class, for that file's reason: it is what the platform has for
 * this, it needs no CSS emitted for it, and it takes a row out of the accessibility tree as well as out
 * of the layout — which a filtered-out row should be.
 */
export function narrow(body: Element, narrowed: Narrowed): void {
  for (const [, rows] of blocksIn(body)) {
    const head = rows[0]
    const whole = head !== undefined && kept(head, narrowed)
    const shown = rows.filter((row) => kept(row, narrowed))
    const visible = whole ? rows : shown.length === 0 ? [] : [head, ...shown].filter((row) => row !== undefined)
    for (const row of rows) {
      if (row instanceof HTMLElement) row.hidden = !visible.includes(row)
    }
  }
}

/**
 * Puts the table's blocks in the asked-for order, or back into the plan's own.
 *
 * ### Why blocks move and rows do not
 *
 * `rows.ts` argues at length that the table's order is the canvas's order and must not be re-derived —
 * "a table ordered by a sort of its own would put its rows in an order the bars are not in". A sort is a
 * reader asking a question for a moment, so it moves whole blocks and never separates an item from its
 * feature: within a block the derived order is untouched, and clearing the sort restores it exactly,
 * because the blocks are read back in document order and `Array.prototype.sort` is stable.
 *
 * ### Why it appends rather than inserting
 *
 * Appending an element that is already in the parent moves it, so walking the wanted order and appending
 * each row lands the whole body in that order with no index arithmetic and no detach-and-reinsert.
 */
export function reorder(body: Element, sorted: Sorted | null): void {
  const blocks = blocksIn(body)
  const keys = [...blocks.keys()]
  if (sorted !== null) {
    const keyOf = (block: string): string =>
      attr(blocks.get(block)?.[0] ?? body, `data-sort-${sorted.column}`)
    keys.sort((left, right) => compareSort(keyOf(left), keyOf(right), sorted.column, sorted.direction))
  }
  for (const key of keys) for (const row of blocks.get(key) ?? []) body.appendChild(row)
}

const orderOf = (row: Element): readonly string[] =>
  [...row.children].map((cell) => attr(cell, 'data-col'))

/**
 * Puts every row's cells in the reader's column order, header included.
 *
 * ### Why it checks before it moves
 *
 * A table of two thousand rows is eighteen thousand cells, and this runs after **every** render — the
 * order has to be re-applied because opening a drawer re-renders the layout the table is in, and the
 * server always draws the default order. So the header row is compared first, and a table already in the
 * wanted order is left entirely alone, which is the overwhelmingly common case.
 *
 * A column the row does not carry is skipped rather than created. The actions column does not exist for a
 * viewer who may write nothing, and a remembered order still names it.
 */
export function layColumns(root: Element, order: readonly string[]): void {
  const head = root.querySelector(HEAD_ROW)
  if (head === null) return
  const wanted = order.filter((key) => orderOf(head).includes(key))
  if (orderOf(head).join(',') === wanted.join(',')) return
  for (const row of root.querySelectorAll(`${HEAD_ROW}, ${ROW}`)) {
    const cells = new Map([...row.children].map((cell) => [attr(cell, 'data-col'), cell]))
    for (const key of wanted) {
      const cell = cells.get(key)
      if (cell !== undefined) row.appendChild(cell)
    }
  }
}

/**
 * Marks the sorted column on its own header and clears every other one.
 *
 * `aria-sort` is the attribute a screen reader reads, and `table-css.ts` generates the arrow from it — so
 * the sort is stated once and the two renderings of that one fact cannot drift.
 */
export function markSorted(root: Element, sorted: Sorted | null): void {
  for (const head of root.querySelectorAll('th[data-col]')) {
    const mine = sorted !== null && attr(head, 'data-col') === sorted.column
    if (!mine) head.removeAttribute('aria-sort')
    else head.setAttribute('aria-sort', sorted.direction === 'asc' ? 'ascending' : 'descending')
  }
}

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
