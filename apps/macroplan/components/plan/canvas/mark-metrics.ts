import type { ArcMetrics, FeatureBar, RailMetrics, Rung } from '@repo/canvas'

/**
 * The vertical geometry of one rail band, and the insets inside it.
 *
 * `chromeHeight` is zero: the dates are three HTML tiers above the canvas, so the first rail starts
 * at the top of the SVG. It stays in the record because `ArcMetrics` and `RailMetrics` both declare
 * it, and an arc's y and a drop target's rail are still measured from the same origin the bars are.
 *
 * ### Why a band is 52px and holds two rows
 *
 * It was 44 and held a 22px bar with a 4px strip of ticks under it. The strip was the whole of what a
 * reader was told about a feature's breakdown — four items as four hairlines — and at that size it
 * was most often mistaken for a rendering artefact.
 *
 * A band is now a **line** with its items as real bars beneath it: the feature's span drawn as a
 * 2px rule between two diamonds at {@link lineTop}, and one 24px bar per item at {@link itemTop},
 * each wide enough to carry its own name. That is 10 + 24 + the 18 the line and the air take, which
 * is 52 — and it is the same 52 at every stop, so the rail column beside the board needs no second
 * number and `happy-dom`, which measures nothing, has nothing to measure.
 *
 * The wider stops draw a **bar** for the feature instead, at `barTop` and `barHeight`, because there
 * are no item bars under it to leave room for.
 *
 * ### What each offset is, all measured from the band's own top
 *
 * | key | px | what it places |
 * | --- | --- | --- |
 * | `lineTop` | 10 | the feature line, at the Sprint stop |
 * | `barTop` | 10 | the feature bar, at the Quarter and Year stops |
 * | `barHeight` | 28 | that bar |
 * | `itemTop` | 20 | the item bars under a feature line, at the Sprint stop |
 * | `itemHeight` | 24 | each of them |
 *
 * `lineTop` and `barTop` are deliberately the same number and deliberately two keys: a line and a bar
 * are two marks that happen to open at the same height, and collapsing them would make a later change
 * to one of them silently move the other.
 */
export const LAYOUT = {
  chromeHeight: 0,
  railHeight: 52,
  lineTop: 10,
  barTop: 10,
  barHeight: 28,
  itemTop: 20,
  itemHeight: 24,
  labelInset: 6,
} as const satisfies ArcMetrics & RailMetrics & Record<string, number>

/** How far a point's centre is from its edge, in px. */
export const NODE_RADIUS = 4.5

/**
 * Where the point that stands for a feature sits on the axis: the middle of the days it takes.
 *
 * Here rather than beside the component that draws it, because two modules need the same answer and
 * one of them has no DOM: `./feature-point.tsx` places the mark, and `./arc-view.ts` places the ends
 * of every arc that touches it. A second opinion about the middle would be an arc that left from
 * beside a dot rather than from it.
 *
 * `./feature-point.tsx` carries why the middle and not an edge.
 */
export const pointX = (bar: FeatureBar): number => bar.x + bar.width / 2

/**
 * Half a diamond's width at a feature line's end, in px, resting and lit.
 *
 * The design's 8px and 10px, as the radius each polygon is drawn from. A diamond rather than a dot
 * because it is the shape this canvas already uses for a zero-day milestone, and a line that ends in
 * one reads as a span with two dated ends rather than as a rule somebody drew.
 */
export const DIAMOND = { rest: 4, lit: 5 } as const

/**
 * Where an arc leaves and arrives, per stop.
 *
 * `arcLayout` takes a bar's top and height and anchors the curve at the **middle** of it, which is
 * exactly right for the two stops that draw a bar. The Sprint stop draws a line and two diamonds, so
 * what an arc should touch there is the line itself — a curve into the middle of where a bar would
 * have been would arrive 14px below the thing it is pointing at, through the item bars.
 *
 * So that stop is given a zero-height bar at the line's own y, which is the honest spelling of "the
 * mark has no height, anchor on it": `barTop + barHeight / 2` is then `lineTop`, with no special case
 * anywhere in `@repo/canvas` and nothing for this module to compute twice.
 */
export const ARC_METRICS: Readonly<Record<Rung, ArcMetrics>> = {
  epic: LAYOUT,
  feature: LAYOUT,
  item: {
    chromeHeight: LAYOUT.chromeHeight,
    railHeight: LAYOUT.railHeight,
    barTop: LAYOUT.lineTop,
    barHeight: 0,
  },
}

/**
 * How far an item bar is pulled in at each end so a run of them does not paint as one block, in px.
 *
 * Presentation only: `data-x` and `data-width` keep the true geometry, which is what the drag reads.
 *
 * There was a `BAR_GAP` of 1 beside it, for a **feature** bar at the two wider stops. Those stops draw
 * a point now (`./rung-view.ts`), and the inset is a large part of why: a 1px gap at each end is
 * narrower than the 1.25px stroke drawn around the bar, so the device meant to separate two
 * back-to-back features was itself invisible at the scale that needed it.
 */
export const ITEM_GAP = 2
