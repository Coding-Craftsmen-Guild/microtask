/** One column of the plan table: what it is keyed on, what it is headed with, and whether it sorts. */
export interface PlanColumn {
  /** The key on `data-col`, which is also what the visibility checkbox and the sheet are keyed on. */
  readonly key: string

  readonly head: string

  /**
   * Whether a reader may order the table by it.
   *
   * True for the six columns that have **one value per feature**. `Item` and `Progress` are per-item, so
   * a block of rows has several of each and no single value to sort by; ordering blocks by one of a
   * feature's items would be a number nobody can point at. `Actions` is three links. Their headers are
   * plain text rather than buttons, which is how a reader is told rather than finding out by clicking.
   */
  readonly sortable: boolean
}

/**
 * Every column, in the order the table opens in.
 *
 * The seven §5 names, plus `Group` — which ADR 0064 added as the table's half of selecting one — plus
 * `Actions`, which is this revision's. The order is the one the first revision wrote its headers in, so
 * a plan looks the same as it did until somebody moves something.
 */
export const COLUMNS: readonly PlanColumn[] = [
  { key: 'epic', head: 'Epic', sortable: true },
  { key: 'feature', head: 'Feature', sortable: true },
  { key: 'item', head: 'Item', sortable: false },
  { key: 'group', head: 'Group', sortable: true },
  { key: 'estimate', head: 'Estimate', sortable: true },
  { key: 'sprint', head: 'Sprint', sortable: true },
  { key: 'progress', head: 'Progress', sortable: false },
  { key: 'blocked', head: 'Blocked by', sortable: true },
  { key: 'actions', head: 'Actions', sortable: false },
]

/**
 * The columns a surface really draws.
 *
 * `Actions` is three links into a drawer's own controls, so a viewer who may write none of them is shown
 * no column rather than a column of nothing. It is filtered here rather than rendered empty so that the
 * column menu cannot offer a checkbox for a column that has no cells — a control that visibly does
 * nothing is worse than an absence.
 */
export const columnsFor = (mayEdit: boolean): readonly PlanColumn[] =>
  mayEdit ? COLUMNS : COLUMNS.filter((column) => column.key !== 'actions')

/** The `id` of the checkbox that shows or hides one column, and what `table-css.ts` keys its rule on. */
export const colId = (key: string): string => `mp-col-${key}`

/** Every column key in the order {@link COLUMNS} declares, which is what a browser starts from. */
export const DEFAULT_ORDER: readonly string[] = COLUMNS.map((column) => column.key)

/**
 * The order with one column swapped with the one beside it, or unchanged where there is nothing beside it.
 *
 * Moving by one place rather than to an index, because the control is two buttons: a reader presses
 * `left` until the column is where they want it. Pressing past either end is a no-op rather than a wrap,
 * which is what a disabled button at the end would have said if the header had room for one.
 */
export function moveColumn(order: readonly string[], key: string, by: -1 | 1): readonly string[] {
  const at = order.indexOf(key)
  const to = at + by
  if (at === -1 || to < 0 || to >= order.length) return order
  const next = [...order]
  next.splice(at, 1)
  next.splice(to, 0, key)
  return next
}

/**
 * A remembered column order, made safe to render.
 *
 * ### Why what comes back is not trusted
 *
 * It comes out of `localStorage`, which is the browser's and not ours: it survives a deploy that renamed
 * a column, it survives a deploy that added one, and it can be edited by anything with a console. So the
 * answer is built from {@link DEFAULT_ORDER} rather than from the stored string — known keys in the order
 * they were remembered, each at most once, then every column the string never mentioned.
 *
 * The two failures that guards against are the ones that would show. A key for a column that no longer
 * exists would leave the header one cell short of its rows, and every cell after it in the wrong place; a
 * column missing from the string would be the one a reader cannot find and has no way to bring back.
 */
export function orderFrom(stored: string | null): readonly string[] {
  const asked = (stored ?? '').split(',')
  const kept = [...new Set(asked)].filter((key) => DEFAULT_ORDER.includes(key))
  return [...kept, ...DEFAULT_ORDER.filter((key) => !kept.includes(key))]
}

/** Which way a sorted column runs. */
export type SortDirection = 'asc' | 'desc'

const NUMERIC = new Set(['estimate', 'sprint', 'blocked'])

const MISSING = -1

const rank = (value: string, numeric: boolean): number | null => {
  if (!numeric) return value === '' ? null : 0
  const read = Number(value)
  return Number.isFinite(read) && read !== MISSING ? read : null
}

/**
 * How two rows compare on one column, with the rows that have no value kept at the bottom.
 *
 * ### Why a number is not compared as a word
 *
 * The keys arrive as attributes, which are strings, and `'9' < '10'` is true of strings and false of
 * days. The three numeric columns are named here rather than sniffed, because a column whose values
 * happened to be digits this week would otherwise change how it sorted next week.
 *
 * ### Why an empty value sinks either way
 *
 * A feature with no estimate and a feature in no group have nothing to be ordered by, and the useful
 * answer is the same whichever way the column runs: the rows that *do* have a value are what somebody
 * asked to see in order, and an ascending sort that opened with forty blanks would have answered a
 * different question. It is what every data table does, and the reason is that "no answer" is not a low
 * answer. Two rows that are both empty compare equal, so they keep the derived order they arrived in.
 */
export function compareSort(
  left: string,
  right: string,
  column: string,
  direction: SortDirection,
): number {
  const numeric = NUMERIC.has(column)
  const [here, there] = [rank(left, numeric), rank(right, numeric)]
  if (here === null || there === null) return here === there ? 0 : here === null ? 1 : -1
  const order = numeric ? here - there : left.localeCompare(right)
  return direction === 'asc' ? order : -order
}
