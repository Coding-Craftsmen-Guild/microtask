import type { Rung } from '@repo/canvas'

/** What one rung of the canvas draws for each feature on a rail. */
export interface RungDrawing {
  /** A bar spanning the days the feature takes, which is the two wider stops' mark. */
  readonly bars: boolean

  /**
   * A rule between two diamonds, which is the Sprint stop's mark for a feature.
   *
   * Never true beside {@link RungDrawing.bars}: they are two drawings of one span, and a stop that
   * drew both would show every feature twice.
   */
  readonly lines: boolean

  /** One bar per item under the feature's line, which only means anything beside a line. */
  readonly items: boolean
}

/**
 * Which of the three each rung draws.
 *
 * ### Bars above, a line with its parts at the bottom
 *
 * Year and Quarter draw a **bar** per feature and no items. Sprint draws a **line** per feature with
 * its items as bars underneath, because at forty pixels a day there is room for the breakdown and a
 * second row of filled bars under a filled bar would read as eight pieces of work rather than one
 * with four parts.
 *
 * The wider two drew a **point** before this, on the argument that a bar's width is illegible at
 * fourteen pixels a day and worse at four. That argument was about the *width* and it stands — what
 * changed is that a width is no longer all a mark carries: `canvas/mark-label.ts` cuts a name to the
 * room there is and drops it outright below four characters, so a bar at those stops gives a reader
 * position, span and, wherever either is read closely enough to matter, a name. A point could give
 * only the first.
 *
 * ### Why items follow lines and not bars
 *
 * An item bar sits under its feature's line and divides the span into the pieces it is made of. The
 * two wider stops draw the feature whole on purpose, and a row of item bars under a feature bar
 * would be the same span claimed twice at two heights.
 */
export const DRAWS: Readonly<Record<Rung, RungDrawing>> = {
  epic: { bars: true, lines: false, items: false },
  feature: { bars: true, lines: false, items: false },
  item: { bars: false, lines: true, items: true },
}
