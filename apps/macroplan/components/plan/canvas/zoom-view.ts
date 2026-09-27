import { ZOOM_STOPS, bestFit, lastPlannedDay, rangeFor, scaleFor } from '@repo/canvas'
import type { CanvasSchedule, DayRange, PlanScale, Rung } from '@repo/canvas'
import { CANVAS_SCALE } from './view'

/** What {@link openingZoom} and {@link ZoomView.rangeFor} read off a plan, and nothing more. */
export interface ZoomPlan {
  readonly sprintLengthDays: number
  readonly schedule: CanvasSchedule

  /**
   * Which working day today falls on, so the axis reaches the marker rather than clipping it.
   *
   * Optional because it is the *page* that knows what time it is: a pure geometry helper must not
   * read a clock, and every call here would otherwise answer differently one midnight to the next.
   */
  readonly todayDay?: number
}

const PANE_WIDTH = 1040

/** One zoom stop as the canvas uses it: how wide a day is, and how many days this plan wants. */
export interface ZoomView {
  readonly scale: PlanScale

  /**
   * The days to draw for one plan at this zoom.
   *
   * A function and not a value, because the extent follows the plan's own span now. `@repo/canvas`
   * carries why in `rangeFor`: a fixed range is a fixed pixel width, and a twelve-day plan drawn on
   * a fixed 120-day axis put every bar in the first tenth of the canvas and left the rest blank.
   */
  readonly rangeFor: (plan: ZoomPlan) => DayRange
}

/**
 * The rung to fall back to when no better answer exists.
 *
 * Reached only when there are no stops to choose between at all, which cannot happen with the three
 * this module declares. {@link openingZoom} is what a plan actually opens at.
 */
export const DEFAULT_ZOOM: Rung = 'feature'

const FINEST_FIRST: readonly Rung[] = ['item', 'feature', 'epic']

/**
 * Which zoom to open a plan at when the reader has never chosen one.
 *
 * The finest scale the plan very nearly fits into, because the finer the scale the more a bar can
 * say: at four pixels a day a feature is a smear, and at forty-two it is a bar wide enough to carry
 * its own name. `bestFit` carries the rule and the reasoning.
 *
 * This is why `readZoom` answers `null` rather than a default. A single default is wrong for most
 * plans — it is how a sixteen-day plan came to be drawn across a quarter of axis, bars huddled in the
 * first ninety pixels of eleven hundred — and it is wrong in a way no amount of choosing the right
 * constant fixes, because the right constant depends on the plan.
 *
 * The rungs are tried finest first, which is what "finest that fits" means. The pane width they are
 * measured against is a constant and deliberately a guess: the range is fixed on the server, where no
 * viewport exists, and measuring in the browser would put the canvas's geometry behind hydration for
 * a number that only decides whether a short plan is followed by spare axis or by a scrollbar.
 */
export function openingZoom(plan: ZoomPlan): Rung {
  const offers = FINEST_FIRST.map((rung) => ({ rung, pxPerDay: ZOOM_STOPS[rung].pxPerDay }))
  const fit = bestFit(offers, {
    lastDay: lastPlannedDay(plan.schedule),
    sprintLengthDays: plan.sprintLengthDays,
    paneWidth: PANE_WIDTH,
    ...(plan.todayDay === undefined ? {} : { todayDay: plan.todayDay }),
  })
  return fit?.rung ?? DEFAULT_ZOOM
}

/**
 * The rung to draw at: the reader's own choice where they have made one, and the plan's own fit
 * where they have not.
 */
export const zoomFor = (chosen: Rung | null, plan: ZoomPlan): Rung => chosen ?? openingZoom(plan)

const viewOf = (rung: Rung): ZoomView => ({
  scale: scaleFor({ pxPerDay: ZOOM_STOPS[rung].pxPerDay, gutter: CANVAS_SCALE.gutter }),
  rangeFor: (plan) =>
    rangeFor({
      lastDay: lastPlannedDay(plan.schedule),
      sprintLengthDays: plan.sprintLengthDays,
      pxPerDay: ZOOM_STOPS[rung].pxPerDay,
      paneWidth: PANE_WIDTH,
      ...(plan.todayDay === undefined ? {} : { todayDay: plan.todayDay }),
    }),
})

/** The three stops, each with its scale and its own way of sizing a plan's axis. */
export const ZOOM_VIEW: Readonly<Record<Rung, ZoomView>> = {
  epic: viewOf('epic'),
  feature: viewOf('feature'),
  item: viewOf('item'),
}

/**
 * What each rung is called on the control.
 *
 * Calendar words rather than the schema's own: a reader picking a zoom is asking how much time they
 * want on screen, not which rung of the plan's hierarchy the renderer will switch to. The rungs are
 * `epic`, `feature` and `item` everywhere else in the codebase and nowhere in the interface.
 */
export const ZOOM_WORDS: Readonly<Record<Rung, string>> = {
  epic: 'Year',
  feature: 'Quarter',
  item: 'Sprint',
}

/** The order the control offers them in: widest first, which is how a zoom control reads. */
export const ZOOM_ORDER: readonly Rung[] = ['epic', 'feature', 'item']
