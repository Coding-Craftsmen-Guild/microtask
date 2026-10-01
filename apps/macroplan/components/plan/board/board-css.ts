/**
 * How wide the rail column is, in px, and the one number the scroller's two halves agree on.
 *
 * A constant because the box inside the scroller is `264 + the canvas`, the corner over the column is
 * the same width, and the column itself is the third — three boxes that have to be one width, in a
 * layout where `happy-dom` measures nothing. It is wider than the 208px the names column was: the
 * rows carry a grip, a swatch, a name and a count now, and a name truncated at eight characters is a
 * column that cannot do the one job it has.
 */
export const RAIL_WIDTH = 264

/** The three tiers of the time header, in px, and their total. */
export const TIER = { year: 20, quarter: 22, sprint: 30 } as const

/** How tall the whole header row is, which is what the corner beside it must match. */
export const HEADER_HEIGHT = TIER.year + TIER.quarter + TIER.sprint

/**
 * The board: one scroller, a sticky header row, and a sticky rail column inside the body.
 *
 * ### Why there is one scroller and not three
 *
 * There were three. The rail tree was a pane of its own scrolling beside the board; inside the board
 * the names column and the timeline were two more, the names scrolling vertically with the plan and
 * the timeline scrolling horizontally under a header. A reader scrolling down the plan scrolled the
 * tree with it — two columns showing the same rails, in the same order, at two different offsets —
 * and a reader scrolling right lost the names nothing had pinned.
 *
 * One scroller with `position: sticky` inside it is what every data grid does, and it is why the
 * alignment is no longer a thing to keep true: the rail row and its band are in the **same** flex
 * row, so they are at the same y because they are the same row, rather than because two panes were
 * laid out from the same constant.
 *
 * The header row sticks to the top and the corner and the rail column stick to the left. Sticky
 * nests, so the corner — which has to hold both edges at once — is a sticky box inside a sticky row.
 * The `z` order is the one that falls out of that: the corner is over the header row, which is over
 * the rail column, which is over the canvas.
 *
 * ### Why the box inside is `min-w-max`
 *
 * The scroller's child has to be as wide as the rail column plus the plan's own days, or the canvas
 * cannot scroll past the pane. `max-content` is exactly that sum and needs no arithmetic here —
 * `w-full` over it is what makes a short plan fill a wide pane rather than ending in bare page.
 *
 * Nothing in the canvas half carries `min-w-0`, deliberately: a flex item's minimum is its content,
 * and the content here is a canvas with a `minWidth` of the plan's own width. Opting out of that
 * would let a long plan be squashed rather than scrolled, which is the one thing the floor is for.
 */
export const BOARD = {
  scroller: 'min-h-[120px] min-w-0 flex-1 overflow-auto',
  box: 'w-full min-w-max',
  headerRow: 'sticky top-0 z-6 flex border-b border-border bg-background',
  corner: 'sticky left-0 z-7 flex shrink-0 items-end border-r border-border bg-background p-2.5',
  bodyRow: 'flex',
  canvas: 'relative flex-1',
} as const

/**
 * The corner over the rail column: the filter, and nothing beside it.
 *
 * ### The `+` that is not here
 *
 * The design puts a 28px square `+` next to the filter. It is dropped, by the product owner's own
 * call, and the reason it is an easy call: adding a rail is one of the three things the Add strip
 * above the board already offers, and a second control for it in the corner of the board would be
 * two ways to do one thing eight pixels apart — with the strip's version the one that says what it
 * will make and where it will go.
 */
export const CORNER = {
  filter:
    'h-7 w-full rounded-md border border-line-strong bg-background px-2 text-[13px] outline-none placeholder:text-hint focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_var(--color-brand-soft)]',
} as const

/**
 * One rail, as a row in the column beside its band.
 *
 * ### Why the swatch is the selection control and the name is a link
 *
 * Two gestures share a row: *light this rail on the board* and *open this rail for editing*. The
 * colour chip is the first, as it was in the tree this column replaces — it is also the thing the eye
 * uses to match a row to its band, so it is doing the job it already did. The name is the second.
 * Wrapping the whole row in a label would swallow the link; a second button beside the name is what
 * produced the `Open` links that used to escape the old sidebar's column.
 *
 * ### The grip, which does not yet drag
 *
 * `⋮⋮` is drawn and `cursor-grab` is on the row, and reordering rails by dragging one is not wired.
 * It is drawn anyway because the row **is** draggable through the rail drawer's own Move controls,
 * and because the alternative — a row that gives no sign it can be reordered — is what sent two
 * readers looking for an option that was already there. The grip is `aria-hidden`: it is a
 * handle for a gesture, and the gesture a keyboard has is in the drawer.
 */
export const RAIL_ROW = {
  column: 'sticky left-0 z-5 shrink-0 border-r border-border bg-background',
  row: 'flex cursor-grab items-center gap-2.5 border-b border-line pr-3.5 pl-1.5 hover:bg-[#faf9fc]',
  grip: 'shrink-0 cursor-grab text-[10px] leading-none text-[#c4c1d0] select-none',
  swatch: 'size-2.5 shrink-0 cursor-pointer rounded-[3px] bg-muted-foreground',
  name: 'min-w-0 flex-1 truncate text-[13px] font-semibold hover:underline',
  nameStatic: 'min-w-0 flex-1 truncate text-[13px] font-semibold',
  count: 'shrink-0 text-[11px] tabular-nums text-muted-foreground',
} as const

/**
 * The three tiers of the time header, and the cells inside each.
 *
 * ### Why there are three where there were two
 *
 * The second row used to carry sprints at two stops and months at the third, under a row of calendar
 * quarters, and the year was nowhere: a plan running into January showed `Q1` with nothing saying
 * which year's. Splitting the year out costs 20px and answers that outright — and it is where the
 * `TODAY` tag goes, which had no row of its own before and so had nowhere to be but on top of a
 * quarter's name.
 *
 * ### Why each row clips
 *
 * The cells are bled past the range on purpose, so nothing stops short of a pane nobody measured
 * (`canvas/view.ts`'s `BLEED_DAYS`). A bleed is meant to be **clipped**, not scrolled to: without
 * `overflow-hidden` the absolutely positioned overflow of a `relative` row is scrollable area, which
 * is a horizontal scrollbar on a plan that fits. The row is their containing block, so hiding its
 * overflow is what clips them, and `cellOf` already clamps the first cell to the axis origin.
 */
export const TIME = {
  header: 'relative flex-1',
  yearRow: 'relative overflow-hidden border-b border-line',
  quarterRow: 'relative overflow-hidden border-b border-line',
  sprintRow: 'relative overflow-hidden',
  year: 'absolute top-0 flex h-full items-center overflow-hidden px-2.5 text-[11px] font-bold tracking-[0.08em] whitespace-nowrap text-brand',
  quarter:
    'absolute top-0 flex h-full items-center overflow-hidden border-l border-line px-2.5 text-[11px] font-semibold whitespace-nowrap text-foreground',
  quarterPart: 'bg-sprint-alt',
  sprint:
    'absolute top-0 flex h-full items-baseline gap-1.5 overflow-hidden border-l border-line px-2.5 whitespace-nowrap',
  sprintName: 'text-[12px] font-semibold text-foreground',
  sprintWhen: 'text-[11px] tabular-nums text-muted-foreground',
  today:
    'absolute top-0.5 z-1 rounded-[4px] bg-gold px-1.5 text-[10px] leading-4 font-bold text-brand',
} as const
