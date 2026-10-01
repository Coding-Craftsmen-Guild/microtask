import { colId, COLUMNS } from './columns'

const PANEL = '[data-slot="table-panel"]'

const ARROW = '[data-slot="sort-arrow"]'

const UP = String.fromCharCode(0x2191)

const DOWN = String.fromCharCode(0x2193)

const hidden = (key: string): string =>
  `${PANEL}:has(#${colId(key)}:not(:checked)) [data-col="${key}"]{display:none}`

/**
 * Column visibility and the sorted column's arrow, as one static sheet.
 *
 * ### Why hiding a column needs no JavaScript at all
 *
 * A checkbox per column and one `:has()` rule per column, anchored on the panel both live in. Unchecking
 * one hides every cell carrying that `data-col` — the header and two thousand bodies at once — with no
 * state, no round trip and nothing for a re-render to undo. It is the mechanism ADR 0064 chose for group
 * selection and `view-switch.ts` for the view tabs, applied to the one other thing on this page that is
 * pure presentation.
 *
 * Nine rules, fixed, because they name columns and columns are a constant. Nothing here is generated from
 * the plan, which is the difference between this sheet and `labels/group-css.ts`.
 *
 * `display:none` rather than `visibility:collapse` on a `<col>`: the `<col>` form is what a table was
 * given for this, and it is unevenly implemented and cannot be driven from a checkbox two elements away.
 *
 * ### Why the arrow is content and not text in the markup
 *
 * The sorted column is `aria-sort` on its own header, which is the attribute a screen reader reads, and
 * the glyph is generated from it. One fact, said once: a sort indicator written into the markup would be
 * a second copy for the client to keep in step, and the half-second where the two disagreed would be a
 * table claiming to be sorted one way and sorted the other.
 */
export const TABLE_CSS = [
  ...COLUMNS.map((column) => hidden(column.key)),
  `[aria-sort="ascending"] ${ARROW}::after{content:"${UP}"}`,
  `[aria-sort="descending"] ${ARROW}::after{content:"${DOWN}"}`,
].join('')

/**
 * The table and the strip of controls over it, as whole class strings.
 *
 * The toolbar is `sticky top-0` and the header row sticks beneath it, so a reader scrolling two thousand
 * rows keeps both the column names and the controls that change them. That is why the header's own
 * offset is a number here rather than `top-0`: two sticky rows in one scroller stack only if the second
 * one is told how tall the first is.
 */
export const TABLE = {
  panel: 'grid min-w-0 gap-2',
  toolbar:
    'sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-background pb-2',
  search:
    'w-56 rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-brand',
  select:
    'rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus-visible:border-brand',
  menu: 'relative text-[13px]',
  menuHead:
    'cursor-pointer list-none rounded-md border border-border bg-background px-2 py-1 font-medium select-none hover:bg-muted',
  menuBody:
    'absolute top-8 left-0 z-30 grid w-64 gap-0.5 rounded-md border border-border bg-background p-1.5 shadow-lg',
  menuRow: 'flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted',
  menuName: 'min-w-0 flex-1 truncate',
  menuMove:
    'rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand',
  spacer: 'flex-1',
  table: 'w-full border-collapse text-left text-[13px]',
  head: 'sticky top-10 z-10 border-b border-border bg-background px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase',
  sortButton:
    'flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand',
  arrow: 'text-[10px]',
  actions: 'flex gap-2',
  action: 'text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand',
} as const

/** Every sentence the table's own controls say, in one record. */
export const TABLE_WORDS = {
  search: 'Search every rail, feature, item and group',
  hint: 'Search…',
  allRails: 'All rails',
  allGroups: 'All groups',
  noGroup: 'In no group',
  columns: 'Columns',
  left: 'left',
  right: 'right',
  edit: 'Edit',
  add: 'Add item',
  remove: 'Delete',
  newRail: 'New rail',
} as const
