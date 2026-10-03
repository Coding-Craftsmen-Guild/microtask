import { COLUMNS } from './columns'

const ARROW = '[data-slot="sort-arrow"]'

const UP = String.fromCharCode(0x2191)

const DOWN = String.fromCharCode(0x2193)

const hidden = (key: string): string => `[data-hide~="${key}"] [data-col="${key}"]{display:none}`

const ITEM_ROW = '[data-kind="item"]'

const REPEATED = ':is([data-col="epic"],[data-col="feature"])'

/**
 * Column visibility and the sorted column's arrow, as one static sheet.
 *
 * ### Why hiding a column re-renders no row
 *
 * A checkbox per column and one rule per column. Unchecking one hides every cell carrying that `data-col` —
 * the header and two thousand bodies at once — with no round trip and no row re-rendered: the table hears
 * the checkbox and states the hidden columns as one `data-hide` list on its root
 * (`./use-table-state.ts`), and the rule asks that list. It asked the checkbox itself, with `:has()`
 * anchored on the panel, until that was measured: mounting the table at the cap restyled every row
 * against nine of them (ADR 0069).
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
 *
 * ### Why an item row's epic and feature go muted
 *
 * They are **repeated**, deliberately: `table-row.tsx` carries why every row restates which feature and
 * which rail it belongs to rather than spanning them, which is that a spanned cell is announced once and
 * then silently inherited, so a reader landing mid-table on `3d, S1` could not ask what it was about.
 * That is right for somebody listening and it is noise for somebody scanning — six rows under one
 * feature printed its name six times at full weight, and the eye could not find the item names for the
 * feature names beside them.
 *
 * Muting is the whole of the fix, and it changes nothing for a reader who is not looking: the words are
 * still in the cell, still in the accessibility tree, still found by the toolbar's search. A rule rather
 * than a class because the condition is *which kind of row this cell is in*, which a cell does not know
 * — the row carries `data-kind` and `:is()` asks from above.
 */
export const TABLE_CSS = [
  ...COLUMNS.map((column) => hidden(column.key)),
  `[aria-sort="ascending"] ${ARROW}::after{content:"${UP}"}`,
  `[aria-sort="descending"] ${ARROW}::after{content:"${DOWN}"}`,
  `${ITEM_ROW} ${REPEATED}{color:var(--color-muted-foreground)}`,
].join('')

/**
 * The table and the strip of controls over it, as whole class strings.
 *
 * ### Why the toolbar is outside the scroller and the header is inside it
 *
 * Both used to be `sticky` in one scroller, the header offset by the toolbar's own height — a number
 * one had to be told about the other, in a layout `happy-dom` cannot measure, and one that was wrong
 * the moment the toolbar wrapped onto a second line. The toolbar is a strip above the scroller now and
 * the header sticks at its top, so neither knows anything about the other: the panel is a column, the
 * strip does not scroll because it is not in the thing that scrolls, and two thousand rows move under
 * a header pinned to the box they are in.
 *
 * ### What makes it read as a table rather than as a list of sentences
 *
 * A hairline under every row and a tint on hover, both in the page's own greys; 10px micro-labels for
 * the headers, which is the size this restyle writes every label at; and actions that are invisible
 * until a row is pointed at. That last one is the biggest change and the same decision the rail tree
 * made for its own add control: nine columns with three links in the ninth meant every row ended in
 * `Edit Add item Delete`, which is three words of chrome per row competing with the plan.
 */
export const TABLE = {
  panel: 'flex min-h-0 min-w-0 flex-1 flex-col',
  toolbar:
    'sticky top-0 z-20 flex h-11 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background px-5 max-sm:px-3',
  search:
    'h-7 w-56 rounded-md border border-line-strong bg-background px-2 text-[13px] outline-none placeholder:text-hint focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_var(--color-brand-soft)]',
  select:
    'h-7 cursor-pointer rounded-md border border-line-strong bg-background px-2 text-[13px] outline-none focus-visible:border-brand',
  menu: 'relative text-[13px]',
  menuHead:
    'flex h-7 cursor-pointer list-none items-center rounded-md border border-line-strong bg-background px-3 font-medium select-none hover:bg-muted',
  menuBody:
    'absolute top-9 left-0 z-30 grid w-64 gap-0.5 rounded-[10px] border border-border bg-background p-2 shadow-[0_12px_32px_rgba(46,36,86,.16),0_2px_6px_rgba(0,0,0,.06)]',
  menuRow: 'flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-muted',
  menuName: 'min-w-0 flex-1 cursor-pointer truncate',
  menuMove:
    'cursor-pointer rounded px-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand',
  spacer: 'flex-1',
  scroller: 'min-h-0 flex-1 overflow-auto',
  table: 'w-full border-collapse text-left text-[13px]',
  head: 'sticky top-0 z-10 border-b border-border bg-background px-3 py-2 text-[10px] font-semibold tracking-[0.05em] whitespace-nowrap text-label uppercase',
  sortButton:
    'flex cursor-pointer items-center gap-1 text-[10px] font-semibold tracking-[0.05em] whitespace-nowrap uppercase hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand',
  arrow: 'text-[10px] text-brand',
  row: 'group/row border-b border-line hover:bg-brand-soft/40',
  block: 'group/row border-b border-line bg-background hover:bg-brand-soft/40',
  actions: 'flex gap-2.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100',
  action: 'cursor-pointer text-brand hover:underline focus-visible:outline-2 focus-visible:outline-brand focus-visible:opacity-100',
  newRail:
    'inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
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
