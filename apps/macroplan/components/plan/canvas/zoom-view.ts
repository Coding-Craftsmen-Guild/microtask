import { ZOOM_STOPS, bestFit, bestSpan, lastPlannedDay, rangeFor, scaleFor, todayLine } from '@repo/canvas'
import type { CanvasSchedule, DayRange, PlanScale, Rung } from '@repo/canvas'
import type { PlanCalendar } from '@repo/schedule'
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

const OFFERS = FINEST_FIRST.map((rung) => ({ rung, pxPerDay: ZOOM_STOPS[rung].pxPerDay }))

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
  const fit = bestFit(OFFERS, {
    lastDay: lastPlannedDay(plan.schedule),
    sprintLengthDays: plan.sprintLengthDays,
    paneWidth: PANE_WIDTH,
    ...(plan.todayDay === undefined ? {} : { todayDay: plan.todayDay }),
  })
  return fit?.rung ?? DEFAULT_ZOOM
}

/**
 * The finest stop that puts a run of working days inside the pane.
 *
 * {@link openingZoom} asks this question of the **whole plan**, measured from day zero. A group chip
 * asks it of one group, measured from wherever that group happens to start — so what varies is a
 * length and not an end day, and this takes the length.
 *
 * It walks the same stops in the same order, finest first, which is what makes "a group of about two
 * sprints shows its items" fall out rather than be written again: a group that short is the first
 * offer that fits, and nothing further down the list is consulted.
 *
 * `todayDay` is deliberately not taken. Reaching the today marker is a property of the plan's own
 * axis, and a reader who asked to look at one group has not asked to see today as well.
 *
 * Neither is `sprintLengthDays`. `bestSpan` carries why at length: it pads by nothing, where `bestFit`
 * pads out to a sprint boundary, and padding a window that already has edges would make a group of
 * about two sprints fail to fit at the stop that exists to hold two sprints.
 *
 * @param days - How many working days the thing being fitted covers.
 * @returns The stop to draw at, widest-case `DEFAULT_ZOOM` for a run no stop can hold.
 */
export function fitFor(days: number): Rung {
  return bestSpan(OFFERS, days, PANE_WIDTH)?.rung ?? DEFAULT_ZOOM
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

/** The two numbers one rung puts a plan on screen with: how wide a day is, and which days are drawn. */
export interface PlanAxis {
  readonly scale: PlanScale

  readonly range: DayRange
}

/**
 * The axis a plan is drawn on at one rung, at one instant.
 *
 * ### Why it is a function two components both call
 *
 * `PlanViews` needs it to draw the board and `PlanScreen` needs it to tell the pointer root how wide a
 * day is. It is pure in its three arguments and both callers pass the same three, so the two agree by
 * construction — which is the same property `PlanBoard` relies on when it calls `railLayout` beside the
 * canvas's own call, and it is cheaper to hold than threading an axis through a component that otherwise
 * shares nothing with the one above it.
 *
 * Two opinions about `pxPerDay` would be a zoom gesture that anchors the scroll against a scale the
 * canvas was not drawn at: the day under the pointer would land a few hundred pixels from where it was,
 * which looks like the zoom jumping rather than like a disagreement about arithmetic.
 *
 * ### Why today is folded in
 *
 * The range has to reach the today marker or the line is clipped off the end of a plan that finished
 * last month. `ZoomView.rangeFor` takes `todayDay` for that, and the day itself can only come from
 * `todayLine`, which needs the scale — so the order here is scale, then today, then range, and that
 * order is why this is one function rather than two exported halves.
 */
export function planAxis(plan: ZoomPlan & PlanCalendar, at: Date, rung: Rung): PlanAxis {
  const view = ZOOM_VIEW[rung]
  const today = todayLine(plan, at, view.scale)
  const reach = today === null ? plan : { ...plan, todayDay: today.day }
  return { scale: view.scale, range: view.rangeFor(reach) }
}
