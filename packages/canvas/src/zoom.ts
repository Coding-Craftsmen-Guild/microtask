import type { DayRange } from './bands.js'
import { FEATURE_RUNG_MAX_DAYS, ITEM_RUNG_MAX_DAYS } from './rungs.js'
import type { Rung } from './rungs.js'

/**
 * One zoom stop: the working days on screen, and how many px each of them gets.
 *
 * A `pxPerDay` and not a whole `PlanScale`, because the gutter is not a zoom decision. The label
 * gutter holds rail names, which are the same length at every rung, so a stop that carried its own
 * gutter would be three chances to disagree about how wide a name column is. A canvas composes a
 * `PlanScale` from this `pxPerDay` and its own single gutter.
 */
export interface ZoomStop {
  /** The working days visible, which is what `rungFor` reads to answer the rung. */
  readonly range: DayRange

  /** Px per working day at this stop. */
  readonly pxPerDay: number
}

const EPIC_STOP_DAYS = 240

const EPIC_PX_PER_DAY = 4

const FEATURE_PX_PER_DAY = 14

const ITEM_PX_PER_DAY = 42

/**
 * The three views a plan is read at, one per rung of design §5, keyed by the rung each one lands on.
 *
 * ### The ranges are derived, not chosen
 *
 * `feature` and `item` take their widths from {@link FEATURE_RUNG_MAX_DAYS} and
 * {@link ITEM_RUNG_MAX_DAYS} rather than restating 60 and 20. `rungFor` decides the rung from the
 * range, so a literal here could drift one day past a boundary and silently hand the canvas a
 * different rung than the key it is filed under — the item stop drawing feature bars, with nothing to
 * catch it but a screenshot. Derived, each stop is the **widest** view still at its own rung by
 * construction, which is also the most useful one: a person zooming to features wants the whole
 * quarter, not most of it.
 *
 * The epic stop cannot be derived the same way, because the epic rung has no upper bound — anything
 * wider than a quarter is epic. {@link EPIC_STOP_DAYS} is a year of working days, which is the low end
 * of §5's own `~1–2 years` row, and it is a chosen number rather than a derived one for that reason.
 *
 * ### Why px per day falls as the range widens
 *
 * A year at the feature rung's 14px a day is 3,360px of axis, which is a horizontal scrollbar rather
 * than a zoom. Each stop's `pxPerDay` is set so the axis stays within roughly a thousand px: 240 days
 * at 4px is 960, 60 at 14 is 840, 20 at 42 is 840. So all three stops draw a canvas of about one
 * width, and zooming changes what is on screen rather than how far the page scrolls.
 *
 * ### Why this is not the app's own record
 *
 * It lives beside `rungFor`, whose boundaries it is derived from, because the invariant that matters is
 * that a stop and the rung it is filed under agree — and that is checkable here, in a package with no
 * DOM, rather than in a component. `zoom.test.ts` asserts `rungFor(ZOOM_STOPS[rung].range) === rung`
 * for all three, which is the one test that keeps this table honest as either side moves.
 */
export const ZOOM_STOPS: Readonly<Record<Rung, ZoomStop>> = {
  epic: { range: { fromDay: 0, toDay: EPIC_STOP_DAYS }, pxPerDay: EPIC_PX_PER_DAY },
  feature: { range: { fromDay: 0, toDay: FEATURE_RUNG_MAX_DAYS }, pxPerDay: FEATURE_PX_PER_DAY },
  item: { range: { fromDay: 0, toDay: ITEM_RUNG_MAX_DAYS }, pxPerDay: ITEM_PX_PER_DAY },
}

/**
 * The rung a `?z=` search param names, or `null` for anything else.
 *
 * `null` and not a defaulted rung, so the caller decides what an absent or a junk param means and this
 * makes no policy. A page wants `'feature'` when nothing was asked for — the view a plan opens at — and
 * a `null` here lets it say so once, rather than this file deciding it for every caller including the
 * ones that would rather 404.
 *
 * Takes `string | null` because that is what `URLSearchParams.get` and Next's `searchParams` both
 * answer, so no call site has to coalesce before asking.
 */
export function rungParam(value: string | null | undefined): Rung | null {
  if (value === 'epic' || value === 'feature' || value === 'item') return value
  return null
}
