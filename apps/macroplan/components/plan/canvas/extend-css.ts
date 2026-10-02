/** How wide a handle is, in px: a 14px circle on a bar, a 12px diamond on a line. */
export const HANDLE = { circle: 7, diamond: 6, plus: 3.5 } as const

/**
 * The handle: a hue-filled shape with a white ring, a plus inside it, and a crosshair over it.
 *
 * It is painted in the mark's own hue so that a handle reads as belonging to the work it extends rather
 * than as chrome the board has grown. The ring is what keeps it visible where it overlaps a bar of the
 * same colour, and the shadow is what lifts it off the rail behind it.
 */
export const EXTEND = {
  sheet: 'absolute top-0 left-0 block w-full [&>*]:pointer-events-auto',
  handle: 'cursor-crosshair',
  shape: 'fill-[var(--mark-hue)] [stroke:#fff] stroke-2 [filter:drop-shadow(0_1px_3px_rgba(0,0,0,.18))]',
  plus: 'pointer-events-none [stroke:#fff] stroke-[1.8] [stroke-linecap:round]',
} as const

/**
 * The provisional bar a drag draws, which has to read as *not yet there*.
 *
 * Dashed, striped, and in the brand's own hue rather than the rail's: nothing on this board is painted
 * like it, so there is no state of the plan it could be mistaken for. The guide at its free edge is what
 * makes the day it will start or end on legible against the grid, and the chip above it says what will
 * be made and how long it is.
 */
export const DRAW = {
  root: 'relative w-full min-w-fit',
  sheet: 'pointer-events-none absolute top-0 left-0 block w-full',
  bar: 'fill-[url(#mp-draw-stripes)] stroke-brand stroke-[1.5] [stroke-dasharray:4_3]',
  guide: 'stroke-brand stroke-[1.5] [stroke-dasharray:3_3]',
  chip: 'pointer-events-none absolute z-30 flex items-center gap-1.5 rounded-[5px] bg-brand px-2 py-[3px] text-[11px] font-semibold text-white',
  meta: 'text-gold',
  stripeOne: 'fill-[#efecfa]',
  stripeTwo: 'fill-[#e4dff7]',
} as const

/** How far above the provisional bar its chip floats, in px. */
export const CHIP_LIFT = 24

/** The id of the stripe pattern the provisional bar is filled with. */
export const STRIPES = 'mp-draw-stripes'
