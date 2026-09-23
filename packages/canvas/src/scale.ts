/**
 * A viewport plus a px-per-working-day, and the one thing every other geometry module in this
 * package is arithmetic over. Deliberately a plain readonly interface rather than a class: this
 * crosses into a React component as a prop, and a class instance does not survive serialisation
 * across the RSC boundary.
 */
export interface PlanScale {
  /**
   * Px per working day, expected to be a positive whole number.
   *
   * A zoom control must step through integers rather than fractions. {@link dayToX} multiplies by
   * this and {@link xToDay} divides by it, and the division is only exact when the value is exact
   * in binary: at `0.1`, days 1, 3 and 13 come back from that round trip as 0, 2 and 12, so a
   * hover names the day before the one it is over and nothing fails loudly enough to notice.
   */
  readonly pxPerDay: number

  /**
   * The left inset, in px, before day 0. Without it a rail label drawn at day 0's x would sit on
   * the axis's own left edge with nothing to its left to hold it.
   */
  readonly gutter: number
}

/** Builds a {@link PlanScale} from its px-per-day and left inset. */
export function scaleFor(options: { readonly pxPerDay: number; readonly gutter: number }): PlanScale {
  return { pxPerDay: options.pxPerDay, gutter: options.gutter }
}

/**
 * The x position of a working-day offset.
 *
 * `day` is signed on purpose: `dateToDay` in `@repo/schedule` answers a real negative offset for
 * any date before a plan's `startDate`, and a today line drawn there must land to the left of the
 * gutter rather than clamp onto day 0 and quietly claim work had already started.
 */
export function dayToX(day: number, scale: PlanScale): number {
  return scale.gutter + day * scale.pxPerDay
}

/**
 * The working-day offset an x position falls on.
 *
 * Floors rather than rounds: every pixel between day n's left edge and day (n + 1)'s left edge
 * belongs to the bar drawn for day n, so a hover a few pixels past that edge must still name day
 * n, not the day after it.
 */
export function xToDay(x: number, scale: PlanScale): number {
  return Math.floor((x - scale.gutter) / scale.pxPerDay)
}

/** The width, in px, of a span of working days at a given scale. */
export function widthOfDays(days: number, scale: PlanScale): number {
  return days * scale.pxPerDay
}
