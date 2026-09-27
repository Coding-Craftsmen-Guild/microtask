import type { FeatureBar } from './rails.js'

/**
 * Half the width and half the height of a milestone diamond, in px.
 *
 * One number for both, so the diamond is square on its diagonals however the bars around it are sized.
 * It is deliberately a little larger than half `LAYOUT.barHeight` in `apps/macroplan`: a diamond
 * inscribed in a bar's height reads as smaller than the bars beside it, because a rotated square
 * encloses half the area of the box it fits in.
 */
export const DIAMOND_RADIUS = 11

/**
 * Whether a placed bar is a milestone: a real position on the axis that takes no time.
 *
 * `width === 0` and not `estimateDays === 0`, which is the same question asked where the answer is
 * already computed. `rails.ts` builds a width as `endDay - startDay` with no `+ 1` precisely so that a
 * zero-day span is a zero width, and the effective estimate a milestone comes from may have been
 * authored on the feature or derived from its items (ADR 0051) — a caller testing the authored field
 * would miss a feature whose children all came to zero, and would need a plan in hand to do it.
 *
 * A feature the pass could **not** place has no bar at all rather than a zero-width one, so it cannot
 * arrive here and be mistaken for a milestone. That distinction is `railLayout`'s: it omits the
 * unplaced and returns the zero-day, and `rails.ts` argues why at the `FeatureBar` it builds.
 */
export function isMilestone(bar: FeatureBar): boolean {
  return bar.width === 0
}

/**
 * The four corners of a diamond centred on a point, as an SVG `points` attribute.
 *
 * A `<polygon>` rather than a `<rect transform="rotate(45)">`: a rotation is relative to the element's
 * own origin, so a rotated rect has to be positioned by undoing the transform — arithmetic that looks
 * right and lands the shape somewhere else, and that `happy-dom` cannot check, since it answers every
 * `getBBox` with a zero `DOMRect`. Four explicit corners are four numbers a test reads directly.
 *
 * Corners run clockwise from the top, which is the order a reader checks them in and the order that
 * makes the string's own symmetry visible: top, right, bottom, left.
 */
export function diamondPoints(cx: number, cy: number, radius = DIAMOND_RADIUS): string {
  const top = `${String(cx)},${String(cy - radius)}`
  const right = `${String(cx + radius)},${String(cy)}`
  const bottom = `${String(cx)},${String(cy + radius)}`
  const left = `${String(cx - radius)},${String(cy)}`
  return `${top} ${right} ${bottom} ${left}`
}
