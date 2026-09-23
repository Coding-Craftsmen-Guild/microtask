import { railsOf } from '@repo/schedule'
import type { ScheduleFeature } from '@repo/schedule'
import { spansById } from './plan.js'
import type { CanvasPlan, CanvasSchedule, CanvasSpan } from './plan.js'
import { dayToX, widthOfDays } from './scale.js'
import type { PlanScale } from './scale.js'

/**
 * One placed feature as a bar: the id it draws for, the days it covers, and where those land in px.
 *
 * `startDay` and `endDay` are carried beside the geometry rather than discarded, so a hover can name
 * the days a bar covers without going back to the spans array to find them again.
 *
 * `width` is `endDay - startDay` at this scale, with **no `+ 1`** — `endDay` is exclusive precisely
 * so a client computing a width never has to remember to add one. A zero-day milestone therefore has
 * `startDay === endDay` and a width of 0: a real bar at a real position that takes no time, which is
 * a different thing from a feature that could not be placed at all.
 */
export interface FeatureBar {
  readonly id: string

  readonly startDay: number

  /** Exclusive: the first working-day offset **not** covered by this bar. */
  readonly endDay: number

  readonly x: number

  readonly width: number
}

/**
 * One rail of the timeline: which epic it belongs to, that epic's own colour, and its bars in order.
 *
 * A rail has no id and no record of its own. `railsOf` identifies a rail by its position and its
 * epic by `features[0].epicId`, so `epicId` is what a caller keys a rail group by — it is unique
 * across the returned boxes, because rails are the grouping of features *by* `epicId`.
 *
 * `colour` is the epic's own `#rrggbb`, passed through untouched: per-epic hue is **data** the API
 * validated, one of an unbounded set, which is why it becomes an inline style rather than a class a
 * runtime value could never choose. It is `null` — not `''` and not an invented default — for a rail
 * whose `epicId` names no epic in the plan, because there is no colour to carry and "no epic claims
 * this rail" is a sentence the caller should get to render on purpose.
 */
export interface RailBox {
  readonly epicId: string

  readonly colour: string | null

  readonly bars: readonly FeatureBar[]
}

interface RailContext {
  readonly spans: ReadonlyMap<string, CanvasSpan>
  readonly colours: ReadonlyMap<string, string>
  readonly scale: PlanScale
}

function barOf(id: string, context: RailContext): FeatureBar | null {
  const span = context.spans.get(id)
  if (span === undefined) return null
  return {
    id,
    startDay: span.startDay,
    endDay: span.endDay,
    x: dayToX(span.startDay, context.scale),
    width: widthOfDays(span.endDay - span.startDay, context.scale),
  }
}

function boxOf(epicId: string, rail: readonly ScheduleFeature[], context: RailContext): RailBox {
  return {
    epicId,
    colour: context.colours.get(epicId) ?? null,
    bars: rail.flatMap((feature) => barOf(feature.id, context) ?? []),
  }
}

/**
 * The plan's rails as boxes of bars, in the exact order the forward pass placed spans in.
 *
 * Order comes from `railsOf` in `@repo/schedule` and is never re-derived here. That is the one
 * shortcut worth naming: rails are ordered by `(railOrder, id)` and features within a rail by
 * `(position, id)`, and a second total order written in this package could disagree with the first
 * on any tie — which is a bar drawn on the wrong rail, silently, at exactly the zoom level nobody
 * tested. A feature whose `epicId` names no epic still forms a rail of its own, ordered after every
 * real one, for the same reason the pass places it rather than dropping it.
 *
 * Spans are read from the **wire** schedule, where the pass's `days` map has already become an array
 * — and that array carries item ids beside feature ids with nothing to tell them apart. This walks
 * the rails and asks {@link spansById} for each feature's own id, so an item's span is never a
 * candidate for a feature bar in the first place. The map is built once here and threaded through
 * every rail.
 *
 * A feature absent from `spans` is **omitted**, not drawn at zero: the pass reports it in
 * `unscheduled` with a reason, and "nothing was sized" is a different sentence from "placed at day
 * zero taking no time" — which is what a zero-day milestone is, and that one does get a bar. So a
 * rail's `bars` may be shorter than its features, and may be empty.
 *
 * Nothing here is written to; neither argument is mutated and every sort runs on a copy inside
 * `railsOf`.
 */
export function railLayout(
  plan: CanvasPlan,
  schedule: CanvasSchedule,
  scale: PlanScale,
): readonly RailBox[] {
  const context: RailContext = {
    spans: spansById(schedule),
    colours: new Map(plan.epics.map((epic) => [epic.id, epic.colour])),
    scale,
  }
  return railsOf(plan).flatMap((rail) => {
    const first = rail[0]
    return first === undefined ? [] : [boxOf(first.epicId, rail, context)]
  })
}
