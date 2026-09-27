import type { DayRange } from './bands.js'
import type { CanvasSchedule } from './plan.js'

/**
 * Everything {@link rangeFor} reads. One object rather than four parameters, as `DropQuery` is.
 */
export interface RangeQuery {
  /** The last day any feature is placed on, from {@link lastPlannedDay}. */
  readonly lastDay: number

  /** The plan's sprint length, which the axis is padded out to a whole number of. */
  readonly sprintLengthDays: number

  /** The chosen zoom's px per day. */
  readonly pxPerDay: number

  /** How wide the pane the canvas is drawn into is, in px. */
  readonly paneWidth: number

  /**
   * Which working day is today, when the canvas should reach it. Omitted where it should not.
   *
   * The today marker is drawn at `dayToX(today)` whatever the range says, so on a plan whose work
   * finished months ago the line lands past the right edge of the `viewBox` and is clipped — with no
   * indication that there was a line at all, which is worse than not drawing one. Reaching it costs
   * a wider axis on an old plan, and that is the honest picture: the gap between the last bar and
   * today is the thing a reader most wants to see there.
   *
   * A day before the plan's own start is ignored rather than extending the axis backwards. Day zero
   * is the plan's first day by construction, and a plan that has not started yet has no "now" to
   * mark inside it.
   */
  readonly todayDay?: number
}

const A_SPRINT = 1

/**
 * The last day the schedule places anything on, or zero for a plan with nothing placed.
 *
 * Reads `spans` and not the plan's features: a feature with no estimate has no span, and it is
 * precisely the placed work that fixes how far the axis must reach. A plan whose every feature is
 * unsized answers zero, and {@link rangeFor} then falls back to a screen's worth of days rather
 * than to an axis of width zero.
 */
export const lastPlannedDay = (schedule: CanvasSchedule): number =>
  schedule.spans.reduce((furthest, span) => Math.max(furthest, span.endDay), 0)

/**
 * The span of days the canvas draws, from day zero to whichever is larger: the plan's own end padded
 * out to a whole sprint, or one pane's worth of days at this zoom.
 *
 * ### Why it is derived rather than a constant
 *
 * `ZOOM_STOPS` fixes a nominal range per rung, and a fixed range is a fixed pixel width: 120 days at
 * 14px is a 1680px canvas whatever the plan holds. A plan spanning twelve days then drew its bars
 * into the first hundred pixels of it and left the rest empty, which is what the deployed page was
 * doing and what made the timeline look broken rather than short.
 *
 * Deriving it inverts the relationship. The zoom still fixes the *scale* — how many pixels a day is
 * worth, which is the thing a person is choosing when they pick Year, Quarter or Sprint — and the
 * *extent* follows the work. A short plan fills the pane at every zoom; a long one overflows it and
 * scrolls, which is the honest rendering of a plan that does not fit.
 *
 * ### Why the rung is not read back off the result
 *
 * `rungFor` maps a range to a rung, and deriving the range means the result no longer identifies
 * the zoom that produced it: a twelve-day plan viewed at Year zoom yields a range `rungFor` calls
 * `item`. Callers pass the chosen rung alongside rather than recovering it, and this returns only
 * the two days.
 *
 * ### Purity
 *
 * Arithmetic on the argument. Nothing is read from the environment and nothing is mutated.
 */
export function rangeFor(query: RangeQuery): DayRange {
  const sprint = Math.max(A_SPRINT, Math.floor(query.sprintLengthDays))
  const reach = Math.max(query.lastDay, query.todayDay ?? 0)
  const padded = Math.ceil((reach + sprint) / sprint) * sprint
  const onePane = Math.ceil(query.paneWidth / Math.max(query.pxPerDay, Number.EPSILON))
  return { fromDay: 0, toDay: Math.max(padded, onePane) }
}

const TOLERABLE_OVERFLOW = 1.5

/**
 * Which of the offered scales opens this plan best: the finest that very nearly fits the pane.
 *
 * ### Why a plan chooses its own opening zoom
 *
 * The zoom fixes pixels per day, so the right one depends entirely on how long the plan is, and a
 * single default is wrong for most plans. A sixteen-day plan opened at the Quarter scale drew its
 * bars into the first ninety pixels of a 1120px canvas and left the rest empty — which is what the
 * deployed page looked like, and it reads as a broken chart rather than as a short plan.
 *
 * Finest-that-fits is the rule because the finer the scale, the more a bar can say: at three pixels
 * a day a feature is a smear, and at forty it is a labelled bar. So the default is the most
 * informative view that does not force the reader to scroll to see the plan at all.
 *
 * ### Why it is still only a default
 *
 * It answers the question "what should this look like before anyone has an opinion". A reader who
 * picks a zoom has an opinion, and their choice is remembered; this is consulted only when there is
 * none to consult.
 *
 * Offers are read in the order given and the first tolerable one wins, so the caller's order is the
 * preference. A plan that fits nothing — one longer than the coarsest scale can show — falls back to
 * the last offer, which is the coarsest, rather than to no answer at all.
 *
 * "Very nearly" is half a pane of overflow. A plan that overruns a little is still better read at the
 * finer scale, where the bars carry their names and the scroll is short; one that overruns several
 * times over is a plan whose shape nobody can see.
 */
export function bestFit<T extends { readonly pxPerDay: number }>(
  offers: readonly T[],
  query: Omit<RangeQuery, 'pxPerDay'>,
): T | null {
  const room = query.paneWidth * TOLERABLE_OVERFLOW
  const fits = offers.find((offer) => {
    const range = rangeFor({ ...query, pxPerDay: offer.pxPerDay })
    return (range.toDay - range.fromDay) * offer.pxPerDay <= room
  })
  return fits ?? offers.at(-1) ?? null
}
