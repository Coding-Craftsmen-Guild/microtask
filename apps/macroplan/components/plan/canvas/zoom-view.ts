import { ZOOM_STOPS, scaleFor } from '@repo/canvas'
import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import { CANVAS_SCALE } from './view'

/** One zoom level as this canvas draws it: the days on screen and the scale they are drawn at. */
export interface ZoomView {
  /** The working days visible, which is also what `rungFor` reads to decide the rung. */
  readonly range: DayRange

  /** The px per day of {@link ZoomView.range}, over this canvas's one label gutter. */
  readonly scale: PlanScale
}

/**
 * The rung a plan opens at when nobody has chosen one.
 *
 * `'feature'`, which is the middle rung and the one {@link CANVAS_RANGE} has always drawn — so a plan
 * with no cookie renders exactly what it rendered before this control existed, and the change is
 * additive rather than a new default nobody asked for. It is also the rung a plan is most often read
 * at: §5 sizes it at about a quarter, which is the horizon most planning conversations have.
 */
export const DEFAULT_ZOOM: Rung = 'feature'

/**
 * Each rung's range and scale, composed once from `ZOOM_STOPS` and this canvas's own gutter.
 *
 * The gutter is **not** part of a stop, and `zoom.ts` in `@repo/canvas` says why: rail names are the
 * same length at every rung, so a per-stop gutter would be three chances to disagree about how wide the
 * name column is. It comes from {@link CANVAS_SCALE}, which is where this app's one gutter is decided,
 * so zooming changes `pxPerDay` and moves the axis's left edge nowhere.
 *
 * Built as a record at module scope rather than a function of a rung, so the three are one value a
 * reader compares against §5's table — and so a rung with no entry is a compile error rather than an
 * `undefined` scale a canvas would draw at zero px a day.
 */
export const ZOOM_VIEW: Readonly<Record<Rung, ZoomView>> = {
  epic: {
    range: ZOOM_STOPS.epic.range,
    scale: scaleFor({ pxPerDay: ZOOM_STOPS.epic.pxPerDay, gutter: CANVAS_SCALE.gutter }),
  },
  feature: {
    range: ZOOM_STOPS.feature.range,
    scale: scaleFor({ pxPerDay: ZOOM_STOPS.feature.pxPerDay, gutter: CANVAS_SCALE.gutter }),
  },
  item: {
    range: ZOOM_STOPS.item.range,
    scale: scaleFor({ pxPerDay: ZOOM_STOPS.item.pxPerDay, gutter: CANVAS_SCALE.gutter }),
  },
}

/** What each rung is called on the control, in the words §5's table uses for its three rows. */
export const ZOOM_WORDS: Readonly<Record<Rung, string>> = {
  epic: 'Year',
  feature: 'Quarter',
  item: 'Sprint',
}

/**
 * The three rungs in the order the control offers them: widest first, so zooming in reads left to right.
 *
 * Widest first and not narrowest, because the control sits above a timeline whose x axis already runs
 * left to right in time: a row of buttons that got *finer* leftward would put the two axes in
 * opposition. It is also the order §5's own table is written in.
 */
export const ZOOM_ORDER: readonly Rung[] = ['epic', 'feature', 'item']
