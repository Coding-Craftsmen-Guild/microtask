import type { RailBox } from './rails.js'
import { xToDay } from './scale.js'
import type { PlanScale } from './scale.js'

/**
 * Where a drag ended, in the canvas's own coordinate space — the space a bar's `x` and a rail's band
 * are both measured in.
 *
 * Not a pointer event and not a rect. Turning one event into one of these is the whole of what a
 * client component has left to do, because that conversion is the one step no test in this repository
 * can check: `docs/adr/0055-canvas-geometry-is-its-own-pure-package.md` records why, and it is the
 * same reason everything here is arithmetic over numbers.
 */
export interface DragPoint {
  readonly x: number

  readonly y: number
}

/**
 * The two numbers a rail's vertical band is made of: the chrome above the first rail, and one rail's
 * own height.
 *
 * Handed in rather than declared here. `apps/macroplan/components/plan/canvas/view.ts` holds both as
 * fields of its `LAYOUT` record and draws every rail from them, alongside where a name, a bar and an
 * item strip sit inside that band — and a package with no viewport and no type size has no grounds to
 * choose what a name has to fit in. The refused alternative was moving those two fields into
 * `@repo/canvas` beside the rest of the geometry, which would leave one file deciding a rail's
 * position.
 *
 * A copy was never an option either way: the caller hands over the record it renders from, so a band
 * computed here and a band drawn there cannot disagree about a value. What they do each hold is the
 * arithmetic — `railTop` there is the forward direction and {@link railAtY} the inverse — and only a
 * test that calls both can pin that, which belongs to the component that first calls this.
 */
export interface RailMetrics {
  readonly chromeHeight: number

  readonly railHeight: number
}

/**
 * A placement: the rail a feature lands on, and the place it takes along that rail.
 *
 * `epicId` because that is what names a rail — `packages/canvas/src/rails.ts` says why a rail has no
 * id of its own — and `position`, because a placement is an order among siblings and never a date
 * (`docs/adr/0048-macroplan-schedules-it-does-not-store-dates.md`). `Position` in
 * `packages/contracts/src/plan.ts` is the field this is sent as, and what it promises about density.
 *
 * `position` counts the rail's **bars**. A rail carrying a feature the forward pass could not place
 * has fewer bars than features — `rails.ts` argues why such a feature is omitted rather than drawn at
 * day zero — so on that rail this index is lower than the position the API stores for the same place.
 * Counting the rail's features instead is not something geometry can do: an unplaced feature has no
 * `x` to compare a drop against. A caller that has to reconcile the two has the plan, which this
 * deliberately does not.
 */
export interface DropTarget {
  readonly epicId: string

  readonly position: number
}

const bandTop = (index: number, metrics: RailMetrics): number =>
  metrics.chromeHeight + index * metrics.railHeight

/**
 * The rail whose band holds `y`, or `null` for a y in no rail's band.
 *
 * Every edge belongs to the band below it — `top <= y < top + railHeight` — so no y falls in two
 * rails, and no y between the chrome and the last rail's bottom falls in none. Above the first rail
 * and from the last rail's bottom edge downward there is no rail, and the answer is `null` and not
 * the nearest one: {@link dropTargetFor} says what that refusal is for.
 *
 * Walks the rails computing each band, rather than dividing `y` by `railHeight` for an index. The
 * division is shorter and it is a second statement of where rail n begins, which is the thing
 * {@link RailMetrics} exists to keep to one; the cost of refusing it is a walk of one plan's rails.
 */
export function railAtY(
  y: number,
  rails: readonly RailBox[],
  metrics: RailMetrics,
): RailBox | null {
  const found = rails.find((_, index) => {
    const top = bandTop(index, metrics)
    return y >= top && y < top + metrics.railHeight
  })
  return found ?? null
}

/**
 * Which rail and which place a drag ending at `point` names, or `null` when it names no placement.
 *
 * `null` is a real answer rather than a failure: the chrome band, the gutter left of day 0 and
 * everything below the last rail are all places a drag can end, and what a caller does there is
 * cancel. It never clamps to the nearest rail — §6 of
 * `docs/superpowers/specs/2026-09-22-macroplan-design.md` records that "there is no packing algorithm
 * and nothing is ever auto-moved", and a clamp turns a mistaken drop into a move the user neither
 * asked for nor saw.
 *
 * The place is how many of that rail's bars start left of `point.x`, read off the {@link RailBox} the
 * caller already holds and never re-ordered here, for the reason `rails.ts` gives at length about an
 * order derived twice. Strictly left, so a drop at a bar's own `x` answers that bar's own place — and
 * a caller comparing that with where the feature already sits gets "nothing moved" for free, and can
 * send nothing at all.
 *
 * {@link xToDay} is asked for the one thing here that is a day: whether the x is on the axis. A day
 * before 0 is left of the plan's own first day, which is where the label gutter is drawn on a canvas
 * showing the plan from day 0; asking `scale.ts` rather than comparing `point.x` with `scale.gutter`
 * leaves where day 0 sits in the module that decides it. Nothing else here needs a day, because what
 * this answers is a position, and the days a bar covers come back out of the forward pass.
 */
export function dropTargetFor(
  point: DragPoint,
  rails: readonly RailBox[],
  scale: PlanScale,
  metrics: RailMetrics,
): DropTarget | null {
  if (xToDay(point.x, scale) < 0) return null
  const rail = railAtY(point.y, rails, metrics)
  if (rail === null) return null
  return {
    epicId: rail.epicId,
    position: rail.bars.filter((bar) => bar.x < point.x).length,
  }
}
