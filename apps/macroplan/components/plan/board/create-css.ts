/**
 * The Add strip, as whole class strings.
 *
 * ### Why a strip and not three buttons
 *
 * Three buttons would make three things with no say in **where** they land: a rail at the bottom, a
 * feature at the end of some rail, an item at the end of some feature. The board is a picture of
 * where everything is, so the gesture that puts something on it should be aimed at the place it goes
 * — which is what a drag is and what a button cannot be.
 *
 * Each pill is still a real control for a keyboard: `./create-pill.tsx` carries what a press does and
 * why that is not the same thing as a drop.
 *
 * ### Why it sits above the board and not in it
 *
 * The board scrolls in both directions. A source of drags inside a scroller is a source that can be
 * scrolled away from its target, and dragging while scrolled is how a gesture gets abandoned halfway.
 * The strip is chrome: it stays while the plan moves under it.
 */
export const STRIP = {
  row: 'flex h-11 shrink-0 items-center gap-2 border-b border-border bg-panel-col px-5 max-sm:px-3',
  label: 'shrink-0 text-[11px] font-semibold tracking-[0.06em] text-hint',
  pill: 'inline-flex h-7 cursor-grab items-center gap-1.5 rounded-full border border-[#d9d6e4] bg-background px-3 text-[12px] font-semibold text-brand shadow-[0_1px_2px_rgba(46,36,86,.06)] hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand active:cursor-grabbing',
  divider: 'h-5 w-px shrink-0 bg-line-strong max-sm:hidden',
  hint: 'min-w-0 truncate text-[12px] text-[#5b5675] max-sm:hidden',
} as const

/**
 * The marks the drop draws while a pill is over the board.
 *
 * ### Why the preview is absolutely positioned and not a class on the target
 *
 * The board's geometry is the server's: a lane is at a y the layout fixed and a bar at an x the
 * schedule fixed, and nothing in the browser recomputes any of it. So a preview cannot be *inserted*
 * anywhere — inserting a row would push every lane below it down, and the canvas beside the column
 * would not move with it. A box drawn over the board at the computed place costs no layout at all,
 * which is the same reason the filter dims rather than hides.
 *
 * `pointer-events-none` on every one of them, for `DragGhost`'s reason: a mark that caught the
 * pointer would put itself between the pointer and the thing being aimed at, and `dragover` would
 * stop firing on the board underneath.
 */
export const DROP_MARK = {
  root: 'relative flex min-h-0 flex-1 flex-col',
  line: 'pointer-events-none absolute z-20 h-[3px] bg-brand',
  box: 'pointer-events-none absolute z-20 rounded-md border-[1.5px] border-dashed border-brand bg-brand-soft/60',
  refused: 'pointer-events-none absolute z-20 rounded-md border-[1.5px] border-dashed border-[#dc2626] bg-[#dc2626]/10',
  chip: 'pointer-events-none absolute z-20 -translate-y-full rounded-[5px] bg-brand px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap text-white',
} as const
