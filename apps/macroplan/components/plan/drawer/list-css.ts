/** The heading of a band in a column, and the sentence under it that says what the band means. */
export const BAND = {
  root: 'grid content-start gap-1.5',
  title: 'text-[12px] font-semibold text-ink-soft',
  sub: 'text-[11.5px] text-hint',
  empty: 'text-[12px] text-label',
} as const

/**
 * What this feature waits on, and what waits on it.
 *
 * The two bands are not symmetrical and the paint says so. **Waits for** is editable: a chip with a
 * cross, and an Add that opens the search. **Unblocks** is the same relation read from the other
 * end, so it is derived rather than set here, and its chips are flat strip-coloured labels with an
 * arrow instead of a cross. Removing one of those means opening *that* feature and unticking this
 * one, which is where the write actually lives.
 */
export const EDGES = {
  chips: 'flex flex-wrap items-center gap-1.5',
  chip: 'flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] border border-line-strong bg-background px-2 text-[12.5px]',
  flat: 'flex h-7 items-center gap-1.5 rounded-[7px] bg-panel-strip px-2 text-[12.5px] hover:bg-brand-soft',
  dot: 'size-[7px] shrink-0 rounded-full',
  name: 'min-w-0 max-w-[160px] truncate',
  cross: 'text-[11px] text-muted-foreground',
  arrow: 'text-[11px] text-hint',
  add: 'flex h-7 w-fit cursor-pointer list-none items-center gap-1 rounded-[7px] border border-dashed border-[#c9c6d6] px-2 text-[12px] text-[#5b5675] hover:border-brand hover:text-brand',
  panel: 'mt-1.5 grid max-h-[360px] gap-1 overflow-y-auto rounded-[10px] border border-line-strong bg-background p-1.5',
  rows: 'grid gap-0.5',
} as const

/**
 * One row of the dependency search: a dot, a name, and a sub-line saying where it ends.
 *
 * A row that would close a loop is **greyed and left in place** rather than dropped from the list,
 * because the question a reader is asking is "can this wait on that", and a list that silently omits
 * the answer reads as a plan that has lost a feature. The refusal is the sub-line, in the warn
 * colour, and it is the same sentence `cycle-check.ts` would have refused the write with.
 */
export const EDGE_ROW = {
  open: 'flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1 text-left hover:bg-brand-soft',
  shut: 'flex w-full cursor-not-allowed items-start gap-2 rounded-md px-2 py-1 text-left opacity-60',
  body: 'grid min-w-0 gap-0.5',
  name: 'truncate text-[13px]',
  where: 'truncate text-[11px] text-hint',
  why: 'truncate text-[11px] text-warn',
} as const

/**
 * The items of a feature, as a list that can be worked down.
 *
 * `grid-cols-[minmax(0,1fr)]` is load-bearing: without a track that is allowed to be *narrower* than
 * its content, a long item name stretches the whole column and the stepper beside it leaves the
 * panel. The last row is the one that adds an item, inside the same box rather than under it, so the
 * list reads as a thing with an end rather than a list and then a form.
 */
export const ITEMS = {
  head: 'flex items-baseline gap-2',
  box: 'grid grid-cols-[minmax(0,1fr)] rounded-lg border border-[#ececf0] bg-background',
  row: 'flex items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0',
  index: 'w-4 shrink-0 text-[11px] tabular-nums text-label',
  name: 'min-w-0 flex-1 truncate text-[13px] hover:text-brand hover:underline',
  plain: 'min-w-0 flex-1 truncate text-[13px]',
  add: 'flex items-center gap-2 px-2 py-1.5',
  addBox: 'min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-label',
  addGo: 'h-[26px] shrink-0 rounded-md bg-brand px-2.5 text-[12px] font-semibold text-white hover:bg-ink-soft',
} as const

/**
 * Where an item sits in its feature, which is the whole of an item's second column.
 *
 * Three cells and two buttons: what comes before, what comes after, and the two moves. It is the one
 * part of the panel that is about *order* rather than about the subject, and it is a column of its
 * own because an item has nothing else to say at that width.
 */
export const ORDER = {
  root: 'grid content-start gap-2',
  cells: 'grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-end',
  cell: 'grid min-w-0 gap-1 rounded-lg bg-panel-strip px-3 py-2.5',
  name: 'truncate text-[13px]',
  edge: 'truncate text-[13px] text-hint',
  steps: 'flex items-center gap-1.5',
  step: 'flex size-8 shrink-0 items-center justify-center rounded-[7px] border border-line-strong text-[13px] hover:bg-brand-soft disabled:opacity-40',
} as const
