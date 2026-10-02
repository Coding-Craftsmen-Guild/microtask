/**
 * The meta line over the name: which rail or feature this belongs to, and the days it occupies.
 *
 * Tabular figures because two subjects open one after the other in the same panel, and a date that
 * shifts sideways between them reads as a different date.
 */
export const META = 'text-[11px] tabular-nums text-muted-foreground'

/**
 * The 10px label over every field, which is the one thing holding the fields row together.
 *
 * The row wraps, so two fields can end up on different lines at a narrow width; the label is what
 * says which control is which once they are no longer side by side. It is uppercase and tracked out
 * rather than bold, so a row of five of them is quiet enough to read the values over.
 */
export const MICRO = 'text-[10px] font-semibold tracking-[0.07em] text-label uppercase'

/**
 * The name, as an input that does not look like one until it is reached.
 *
 * It is the panel's heading in every way but markup, at 17px semibold flush with the meta line above
 * it, and it is still the field the name is typed in. The border is transparent at rest, the line
 * colour on hover and brand on focus, so the box appears exactly when it can be used. The negative
 * margin cancels its own padding, which is what keeps the text aligned with everything under it.
 */
export const NAME_INPUT =
  'w-full -mx-1.5 rounded-[7px] border border-transparent bg-transparent px-1.5 py-1 text-[17px] font-semibold leading-tight outline-none hover:border-line-strong focus:border-brand focus:bg-background'

/** The same name where there is no rename to offer: the heading without the box around it. */
export const NAME_PLAIN = 'text-[17px] font-semibold leading-tight'

/** The row the fields sit in: wrapping, bottom-aligned, so a label never pushes its control up. */
export const FIELD_ROW = 'flex flex-wrap items-end gap-2.5'

/** One field and its label, stacked. */
export const FIELD_CELL = 'grid shrink-0 gap-1'

/** The hairline between the fields about this subject and the group chips, which are about a set. */
export const FIELD_DIVIDER = 'h-[34px] w-px shrink-0 self-end bg-line'

/** The sentence under the fields: what a pin means, and what the schedule did with the estimate. */
export const FIELD_HINT = 'max-w-[560px] text-[11.5px] leading-[1.45] text-hint'

/** What a refused write says, under the field that refused it. */
export const FIELD_PROBLEM = 'text-[12px] text-danger'

/**
 * A stepper: minus, a value, plus, in two sizes, which are the same control at two jobs.
 *
 * The full size is a field in the identity column. The mini is a row in the items list, where the
 * same half-day step is needed twenty times over and a 34px control would make the list twice as
 * tall as the panel. Both keep a real `input` in the middle: the buttons are the fast path, and
 * typing is the one that answers "make it 12", which no amount of clicking does well.
 */
export const STEPPER = {
  row: 'flex h-[34px] w-fit items-stretch overflow-hidden rounded-lg border border-line-strong bg-background',
  step: 'flex w-[30px] shrink-0 cursor-pointer items-center justify-center text-[13px] text-ink-soft hover:bg-brand-soft disabled:cursor-default disabled:opacity-40',
  value: 'w-[46px] border-x border-line text-center text-[13px] font-semibold tabular-nums outline-none focus:bg-brand-soft',
  miniRow: 'flex h-6 w-fit shrink-0 items-stretch overflow-hidden rounded-md border border-line-strong bg-background',
  miniStep: 'flex w-5 shrink-0 cursor-pointer items-center justify-center text-[11px] text-ink-soft hover:bg-brand-soft disabled:cursor-default disabled:opacity-40',
  miniValue: 'w-9 border-x border-line text-center text-[11px] font-semibold tabular-nums outline-none focus:bg-brand-soft',
} as const

/**
 * The sprint field: a stepper whose middle is a disclosure rather than a number.
 *
 * A sprint is not a quantity, so the value reads `S3` and says underneath whether that is the
 * schedule's answer or somebody's pin. Opening it lists the sprints with their dates, which is the
 * only way to answer "when is S3" without counting. On an item it is a pill instead: an item's
 * sprint follows its order inside its feature, so there is nothing to set.
 */
export const SPRINT = {
  value: 'flex min-w-[92px] cursor-pointer list-none items-center gap-1.5 border-x border-line px-2 text-[13px] font-semibold',
  mode: 'text-[11px] font-normal text-muted-foreground',
  caret: 'ml-auto text-[9px] text-muted-foreground',
  pill: 'flex h-[34px] w-fit items-center gap-2 rounded-lg bg-panel-strip px-2.5 text-[13px] font-semibold',
  pillNote: 'text-[11px] font-normal text-muted-foreground',
  list: 'mt-1 grid max-h-[240px] w-[240px] gap-0.5 overflow-y-auto rounded-[10px] border border-line-strong bg-background p-1 shadow-[0_8px_24px_rgba(46,36,86,.12)]',
  row: 'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12.5px] hover:bg-brand-soft',
  rowOn: 'flex w-full items-center gap-2 rounded-md bg-brand-soft px-2 py-1 text-left text-[12.5px] font-semibold',
  note: 'ml-auto shrink-0 text-[11px] text-hint',
  tick: 'shrink-0 text-[11px] text-brand',
  earlier: 'ml-auto shrink-0 text-[11px] text-warn',
} as const

/**
 * The picker that moves work: a rail for a feature, a feature for an item.
 *
 * It is a `details` that opens **in flow** rather than a floating popover, and that is the panel it
 * lives in talking: the body scrolls, so anything absolutely positioned inside it is clipped at the
 * bottom edge, which is the same reason the design puts the dependency search inline. Opening one
 * pushes the fields under it down; nothing is ever half-visible.
 */
export const PICKER = {
  root: 'grid gap-1',
  opener: 'flex h-[34px] min-w-[150px] max-w-[300px] cursor-pointer list-none items-center gap-2 rounded-lg border border-line-strong px-2.5 text-[13px] open:border-brand',
  swatch: 'size-[9px] shrink-0 rounded-full',
  name: 'min-w-0 truncate',
  caret: 'ml-auto shrink-0 text-[9px] text-muted-foreground',
  panel: 'mt-1 grid max-h-[260px] w-[260px] gap-1 overflow-y-auto rounded-[10px] border border-line-strong bg-background p-1.5 shadow-[0_8px_24px_rgba(46,36,86,.1)]',
  search: 'h-[30px] rounded-md border border-line-strong px-2 text-[12.5px] outline-none focus:border-brand',
  rows: 'grid gap-0.5',
  row: 'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-brand-soft disabled:opacity-50',
} as const

/**
 * A group chip: a radio nobody can see, and a label anybody can hit.
 *
 * The chips are a radio group rather than buttons, because a feature is in one group or in none and
 * that is what a radio means: arrow keys move between them, the set has one name, and a reader using
 * a screen reader hears a choice rather than a row of unrelated controls. The input is `sr-only` and
 * the label carries the paint, which is also the only way to colour a chip in its group's own hue.
 */
export const CHIP = {
  row: 'flex flex-wrap items-center gap-1.5',
  off: 'flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-background px-2.5 py-[5px] text-[12px] hover:border-brand',
  on: 'flex cursor-pointer items-center gap-1.5 rounded-full border bg-brand-soft px-2.5 py-[5px] text-[12px] font-semibold text-ink-soft',
  dot: 'size-2 shrink-0 rounded-full',
  hollow: 'size-2 shrink-0 rounded-full border border-line-strong',
} as const

/**
 * The keyboard outline a `summary` and an `sr-only` radio need drawn for them.
 *
 * Both are focusable things whose focus ring the browser puts somewhere useless: on a marker that is
 * hidden, or on an input a pixel wide. Each rule paints the ring on what a reader can actually see.
 * Safari's own marker goes with them, since `list-none` alone does not remove it.
 */
export const FIELD_CSS = [
  '[data-slot="drawer-panel"] summary::-webkit-details-marker{display:none}',
  '[data-slot="drawer-panel"] summary:focus-visible{outline:2px solid var(--color-brand);outline-offset:1px}',
  '[data-slot="drawer-panel"] .sr-only:focus-visible+*{outline:2px solid var(--color-brand);outline-offset:1px}',
].join('')
