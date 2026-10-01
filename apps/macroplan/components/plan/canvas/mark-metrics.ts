import type { ArcMetrics, RailMetrics } from '@repo/canvas'

/**
 * The vertical geometry of one rail band, and the horizontal insets inside it.
 *
 * `chromeHeight` is zero: the quarter and week headings are an HTML row above the canvas, so the
 * first rail starts at the top of the SVG. It stays in the record because `ArcMetrics` and
 * `RailMetrics` both declare it, and an arc's y and a drop target's rail are still measured from the
 * same origin the bars are.
 *
 * The band is 44px and the bar 22, against 58 and 18 in the first revision. A denser row with a
 * fatter bar is what both reference tools do.
 */
export const LAYOUT = {
  chromeHeight: 0,
  railHeight: 44,
  barHeight: 22,
  barTop: 9,
  markHeight: 4,
  markTop: 35,
  labelInset: 6,
} as const satisfies ArcMetrics & RailMetrics & Record<string, number>

/** How far a point's centre is from its edge, in px. */
export const NODE_RADIUS = 4.5

/**
 * How far a bar is pulled in at each end so a run of them does not paint as one block, in px.
 *
 * Presentation only: `data-x` and `data-width` keep the true geometry, which is what the drag reads.
 */
export const BAR_GAP = 1
