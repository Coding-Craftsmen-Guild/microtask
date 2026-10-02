import type { Rung } from '@repo/canvas'

/** What one rung of the canvas draws for each feature on a rail. */
export interface RungDrawing {
  /** A point at the middle of the days the feature takes, which is the two wider stops' mark. */
  readonly points: boolean

  /**
   * A rule between two diamonds, which is the Sprint stop's mark for a feature.
   *
   * Never true beside {@link RungDrawing.points}: they are two drawings of one span, and a stop that
   * drew both would show every feature twice.
   */
  readonly lines: boolean

  /** One bar per item under the feature's line, which only means anything beside a line. */
  readonly items: boolean
}

/**
 * Which of the three each rung draws.
 *
 * ### A point above, a line with its parts at the bottom
 *
 * Year and Quarter draw a **point** per feature and no items. Sprint draws a **line** per feature with
 * its items as bars underneath, because at forty pixels a day there is room for the breakdown and a
 * second row of filled bars under a filled bar would read as eight pieces of work rather than one
 * with four parts.
 *
 * ### Why the wider two went back to a point
 *
 * They drew a bar for a revision, on the argument that `canvas/mark-label.ts` had made a bar's width
 * no longer the only thing it carried: a name could sit inside it, so a reader got position, span and
 * a name where a point gave only the first.
 *
 * What that argument left out is what a *row* of them looks like. Features on a rail are scheduled
 * back to back, so at four pixels a day a rail is one unbroken block of hue a reader cannot count the
 * pieces of, and the 1px inset between bars is below the width of the stroke drawn around each. The
 * names do not rescue it either, because a bar that narrow has no room for one.
 *
 * A point is the mark that gets *better* as the scale widens rather than worse. Three features in a
 * row are three dots with air between them at any zoom, and the air is the gap in days — so the one
 * thing a reader is at Year zoom to see, the shape of the work over a year, is the thing the mark
 * draws. The span itself is not lost: `data-start-day`, `data-end-day`, `data-x` and `data-width`
 * stay true on the point, the hover card still gives the dates, and clicking drills to the stop that
 * draws the span as a span (`canvas/plan-pointer.tsx`).
 *
 * The name stays wherever there is room for it — beside the point rather than inside it, budgeted
 * against the gap to the next mark on the rail. That is Quarter in practice and Year for a rail whose
 * work is spread out, which is the honest version of the claim the bar was defended with.
 *
 * ### Why items follow lines and not points
 *
 * An item bar sits under its feature's line and divides the span into the pieces it is made of. The
 * two wider stops draw the feature as one mark on purpose, and a row of item bars under a point would
 * be a breakdown of a span that stop is not drawing.
 */
export const DRAWS: Readonly<Record<Rung, RungDrawing>> = {
  epic: { points: true, lines: false, items: false },
  feature: { points: true, lines: false, items: false },
  item: { points: false, lines: true, items: true },
}
