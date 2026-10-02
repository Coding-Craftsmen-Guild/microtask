/**
 * The custom property the panel's height lives in, and what it opens at.
 *
 * A property on the document rather than React state, because the thing being resized is a **server
 * component**: the panel, the board above it and everything in both are rendered on the server, and a
 * height held in state would make the drag re-render a tree of two thousand marks sixty times a
 * second. The grip writes one property; the browser relayouts; nothing re-renders at all.
 *
 * It is also what lets the height survive a navigation. Opening another feature replaces the panel's
 * contents through the router, and a `useState` in the panel would go with it — the property is on
 * `<html>`, which no route change touches.
 */
export const PANEL_HEIGHT = '--plan-panel'

/** How tall the panel opens, in px, and the range a reader may drag it to. */
export const PANEL_SIZE = { open: 360, min: 140, max: 820 } as const

/** Where a reader's own height is remembered, per browser and per origin. */
export const PANEL_STORE = 'mp-panel-height'

/**
 * The panel the drawer routes open in: a grip, a tab strip, and a body that scrolls.
 *
 * ### Why it is under the board and not over it
 *
 * It was a 28rem dock `fixed` to the right-hand edge, behind a scrim that dimmed the plan. Every one
 * of those three decisions cost something. The dock covered a quarter of the board — including, on a
 * wide plan, the very bars a reader had just clicked — so editing a feature meant losing sight of
 * where it sits. The scrim said *finish here before you do anything else*, which is false: the whole
 * point of this page is that a plan is read while it is changed. And 28rem is a column, so a form
 * about one feature was eight fields stacked vertically in a strip narrower than the names column.
 *
 * Under the board, the board **shrinks** rather than being covered, the form has the page's full
 * width to lay three columns out in, and nothing is dimmed because nothing is blocked.
 *
 * ### Why the height is a custom property
 *
 * {@link PANEL_HEIGHT} carries it: the panel is server-rendered, so a height in React state would
 * re-render the plan on every pointer move of a drag.
 */
export const PANEL = {
  dock: 'flex shrink-0 flex-col border-t border-[#dcdae4] bg-background shadow-[0_-6px_20px_rgba(46,36,86,.06)]',
  grip: 'flex h-2.5 shrink-0 cursor-row-resize items-center justify-center bg-panel-strip hover:bg-brand-soft',
  gripPill: 'h-1 w-11 rounded-full bg-[#cfccd9]',
  strip: 'flex h-[38px] shrink-0 items-center gap-1 border-b border-border bg-panel-strip px-2',
  hint: 'ml-auto shrink-0 truncate pr-2 text-[12px] text-hint max-sm:hidden',
  body: 'min-h-0 flex-1 overflow-y-auto',
} as const

/**
 * What is inside the panel: three columns on a wide screen, stacked on a narrow one.
 *
 * ### Why three columns, and why that is the point of moving the panel at all
 *
 * A 28rem dock could only stack — eight fields in a column, with the dependency editor and the item
 * list below the fold of a strip narrower than the rail names. The panel has the page's whole width,
 * so the three things a reader does to a feature are side by side and none of them is scrolled to:
 * name and size it, say what it waits on, work through its items.
 *
 * The split is the design's own `1.45fr 1fr 1fr`. The first column holds the name, a row of fields
 * and the hints under them and needs the most room; the other two are lists.
 *
 * ### Why it collapses rather than scrolling sideways
 *
 * Under `lg` it is one column and the panel scrolls vertically, which is what the dock did and is the
 * right answer at that width: three 300px columns on a phone is three columns nobody can read. The
 * breakpoint is the one number here that is not the design's, because the design is drawn at 1440.
 */
export const PANEL_GRID = {
  root: 'grid gap-x-6 gap-y-4 px-5 py-4 lg:grid-cols-[1.45fr_1fr_1fr] max-sm:px-3',
  pair: 'grid gap-x-6 gap-y-4 px-5 py-4 lg:grid-cols-[1.45fr_2fr] max-sm:px-3',
  wide: 'lg:col-span-3',
  column: 'grid min-w-0 content-start gap-3',
  split: 'grid min-w-0 content-start gap-3 lg:border-l lg:border-line lg:pl-6',
} as const

/**
 * One tab in the strip: what is open, and the way out of it.
 *
 * The active tab is white with a border and **no bottom border**, pulled down a pixel so it overlaps
 * the strip's own rule — which is what makes it read as the front of a stack rather than as a
 * selected button. A browser draws its own tabs that way and so does every editor; it is the one
 * shape that says *this panel is showing this one*.
 *
 * A tab is capped at 280px and its name truncates, because a feature's name is as long as somebody
 * typed it and a strip of tabs that each took their name's width would push the rest off the row.
 */
export const TAB = {
  open: 'flex h-8 max-w-[280px] translate-y-px items-center gap-1.5 rounded-t-lg border border-border border-b-background bg-background px-2.5',
  marker: 'size-2 shrink-0',
  kind: 'shrink-0 text-[11px] text-hint',
  name: 'min-w-0 truncate text-[12px] font-semibold text-foreground',
  close:
    'flex size-[18px] shrink-0 items-center justify-center rounded text-[13px] leading-none text-muted-foreground hover:bg-[#ecebf1] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand',
} as const

/**
 * What a tab's 8px marker is, which says which kind of thing the tab holds.
 *
 * A filled circle for a feature and an outlined square for an item, both in the subject's own hue —
 * the same pair the Add strip's pills draw and the same hue the mark on the board is painted in, so a
 * tab can be matched to the thing it opened without reading it. Two shapes rather than two colours,
 * because the colour is already carrying which rail or group this belongs to.
 */
export const TAB_MARK: Readonly<Record<'feature' | 'item', string>> = {
  feature: 'size-2 shrink-0 rounded-full',
  item: 'size-2 shrink-0 rounded-[2px] border-[2px] bg-transparent',
}
