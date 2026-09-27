/**
 * The tray under the board: a hairline strip, not a card.
 *
 * A `rounded-xl` panel with a `ring-1` around it — which is what the conflict list was — reads as a
 * separate document stapled to the page. A strip divided from the board by one border reads as part
 * of the same surface, which is what it is: the rest of the plan.
 */
export const TRAY = {
  panel: 'max-h-44 shrink-0 overflow-y-auto border-t border-border bg-background px-4 py-2.5 max-sm:px-3',
  heading: 'flex items-center gap-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase',
  count:
    'inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-semibold text-foreground tabular-nums',
  rows: 'mt-1.5 grid list-none gap-0.5 p-0',
  row: 'flex flex-wrap items-baseline gap-x-2 text-[13px]',
  name: 'font-medium hover:underline',
  rail: 'rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground',
  why: 'text-[12px] text-muted-foreground',
} as const

/**
 * The warning mark an entity carries in a list, and the callout it carries in its own drawer.
 *
 * One colour for every kind. The old panel gave each section its own accent — destructive for
 * cycles, gold for set-aside edges, grey for the unplaced — which asked a reader to learn a key
 * before they could read a page they had not chosen to visit. A single mark says "look here", and
 * the words beside it say what for.
 */
export const MARK = {
  dot: 'inline-block size-1.5 shrink-0 rounded-full bg-gold-deep',
  chip:
    'inline-flex items-center gap-1.5 rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-medium text-foreground',
  callout: 'grid gap-1 rounded-md border border-gold-deep/40 bg-gold/10 px-2.5 py-2',
  calloutRow: 'flex items-baseline gap-2 text-[12px]',
  calloutKind: 'font-medium',
  calloutWhy: 'text-muted-foreground',
} as const
