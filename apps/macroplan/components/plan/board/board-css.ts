/**
 * The board's two columns: names that stay put, and a timeline that scrolls under them.
 *
 * ### Why the names left the SVG
 *
 * The first revision drew rail names into a 160px gutter inside the `viewBox`, to the left of day
 * zero. Three things followed from that and all three were wrong. The names scrolled away sideways
 * with the bars, so a reader scrolled into the plan and lost track of which rail they were on. They
 * were `<text>`, so they could not be links, could not truncate, and could not carry a badge. And
 * the gutter was dead width on every canvas whether or not a name needed it.
 *
 * As HTML in a column beside the scroller they stay put, take a link and a count and a warning dot,
 * and truncate properly. The SVG is left holding only geometry, which is what it is good at.
 *
 * ### How the two columns stay in step
 *
 * They do not synchronise anything. Both are laid out from the same numbers — `LAYOUT.railHeight`
 * for a band and `HEADER_HEIGHT` for the strip above it — so row *n* is at the same y in each by
 * construction. Vertical scrolling is shared because both sit inside one scroller; only the right
 * column scrolls horizontally.
 */
export const BOARD = {
  scroller: 'flex min-h-0 flex-1 items-stretch overflow-y-auto',
  names: 'sticky left-0 z-10 flex w-52 shrink-0 flex-col border-r border-border bg-background',
  timeline: 'min-w-0 flex-1 overflow-x-auto',
  railRow:
    'flex items-center gap-2 border-b border-border/60 px-3 text-[13px] hover:bg-muted/60',
  railName: 'min-w-0 flex-1 truncate font-medium hover:underline',
  railStatic: 'min-w-0 flex-1 truncate font-medium',
  railSwatch: 'size-2.5 shrink-0 rounded-[3px] bg-muted-foreground',
  railCount: 'shrink-0 text-[11px] tabular-nums text-muted-foreground',
  headerCell: 'shrink-0 border-b border-border bg-background',
} as const

/**
 * The height of the HTML time header, in px, and the one number the two columns must agree on.
 *
 * Two rows: the quarter over the weeks inside it. It is a constant rather than a measurement because
 * the names column has to leave exactly this much room at its top for row zero to line up with rail
 * zero, and `happy-dom` measures nothing.
 */
export const HEADER_HEIGHT = 44

/** The quarter row and the week row, splitting {@link HEADER_HEIGHT} between them. */
export const QUARTER_HEIGHT = 22

/**
 * The time header's two rows, and the absolutely positioned cells inside them.
 *
 * ### Why `w-full` and not a width
 *
 * The header had a fixed `width` — the canvas's own — and the canvas beside it is `w-full` over a
 * `minWidth`. On a pane wider than the plan those are two different numbers, and the difference showed
 * twice: the header's box ended before the pane did, and the bled cells painting past it extended the
 * scroller's scrollable area, so a plan that fitted on screen grew a horizontal scrollbar anyway.
 *
 * Both say the same thing now — fill the pane, never be narrower than the plan's own days — which
 * resolves to one number, because `min-width` wins over a percentage that came out smaller. The two
 * cannot scroll apart, since neither was told a width that the other was not.
 *
 * ### Why the rows clip
 *
 * The cells are bled past the range on purpose, so that nothing stops short of a pane nobody measured
 * (`canvas/view.ts`'s `BLEED_DAYS`). A bleed is meant to be **clipped**, not scrolled to: without
 * `overflow-hidden` the absolutely positioned overflow of a `relative` row is scrollable area, which
 * is the scrollbar above. The row is their containing block, so hiding its overflow is what clips
 * them, and the first cell is unaffected because `cellOf` already clamps it to the axis origin.
 */
export const TIME = {
  header: 'sticky top-0 z-10 w-full bg-background',
  quarterRow: 'relative w-full overflow-hidden border-b border-border/60',
  weekRow: 'relative w-full overflow-hidden border-b border-border',
  quarter:
    'absolute top-0 flex h-full items-center overflow-hidden border-l border-border/60 px-2 text-[11px] font-semibold whitespace-nowrap text-foreground',
  week: 'absolute top-0 flex h-full items-center overflow-hidden border-l border-border/40 px-2 text-[11px] text-muted-foreground tabular-nums',
} as const
