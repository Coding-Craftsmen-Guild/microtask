import type { ArcMetrics, LabelMetrics, RailMetrics } from '@repo/canvas'

/**
 * The vertical geometry of one rail band, and the horizontal insets inside it.
 *
 * `chromeHeight` is zero: the quarter and week headings are an HTML row above the canvas, so the
 * first rail starts at the top of the SVG. It stays in the record because `ArcMetrics` and
 * `RailMetrics` both declare it, and an arc's y and a drop target's rail are still measured from the
 * same origin the bars are.
 *
 * The band is 44px and the bar 22, against 58 and 18 in the first revision. A denser row with a
 * fatter bar is what both reference tools do, and it is what makes a name fit inside the bar.
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

/**
 * How a **bar's** name is measured, for `barLabels`.
 *
 * `charWidth` is the average advance of the 11px system stack the labels are set in, near enough for
 * a truncation budget. It is deliberately a slight over-estimate: budgeting a little short leaves a
 * gap, and budgeting long overlaps the next bar.
 *
 * The inset clears {@link BAR_GAP} as well as {@link LAYOUT}.labelInset, because the gap is taken off
 * the bar's *drawn* width — a label measured against the full span would overrun the edge it is
 * written inside.
 */
export const LABEL_METRICS: LabelMetrics = {
  charWidth: 6.1,
  inset: LAYOUT.labelInset + BAR_GAP,
  minInside: 6,
  overhang: 220,
}

/**
 * How a **point's** name is measured, which is not how a bar's is.
 *
 * A node has no width to write inside, so every label at those rungs sits after its point and is
 * bounded by the next one — which is what stops two names on one rail overlapping when the features
 * are days apart. The inset clears the node's own radius as well as the usual gap, so the text
 * starts beside the point rather than on it.
 *
 * `minInside` is above any width a node reports, so `barLabels` never decides a point is wide enough
 * to hold text: the decision is made here, once, rather than falling out of a zero width.
 */
export const NODE_LABEL_METRICS: LabelMetrics = {
  charWidth: 6.1,
  inset: LAYOUT.labelInset + NODE_RADIUS,
  minInside: Number.POSITIVE_INFINITY,
  overhang: 260,
}
