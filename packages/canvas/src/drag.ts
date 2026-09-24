import type { FeatureBar, RailBox } from './rails.js'
import { xToDay } from './scale.js'
import type { PlanScale } from './scale.js'

/**
 * Where the dragged bar's own **top-left corner** ended up, in the canvas's own coordinate space —
 * the space a bar's `x` and a rail's band are both measured in.
 *
 * The pointer's position is not that, and the difference is the offset inside the bar that the drag
 * was started at. Subtract it: `pointerX - (pointerDownX - bar.x)`, and the same on `y`. That is the
 * convention every answer here is computed in, because {@link dropTargetFor} compares this `x`
 * against each bar's `x`, and a bar's `x` is its left edge (`packages/canvas/src/rails.ts`). Handing
 * over a raw pointer x instead reads as a drag that travelled that offset further than it did, so
 * "dropped where it began changes nothing" fails by it — up to a whole bar's width for a bar grabbed
 * at its right end, which on a dense rail is several days and several siblings. `y` is only ever
 * asked which rail's band it falls in, so the same subtraction matters there for one case rather
 * than every one: a bar grabbed near its bottom edge and nudged down puts the pointer in the next
 * band while the bar itself has not left its own.
 *
 * Not a pointer event and not a rect. Turning one event into one of these — that subtraction
 * included — is the step no test in this repository can check:
 * `docs/adr/0055-canvas-geometry-is-its-own-pure-package.md` records why, and it is the same reason
 * everything here is arithmetic over numbers. Deciding what to do with the answer is a client
 * component's own work, and so is the request it sends.
 */
export interface DragPoint {
  /** The dragged bar's left edge, which is the pointer's x less the grab offset inside the bar. */
  readonly x: number

  /** The dragged bar's top edge, which is the pointer's y less the grab offset inside the bar. */
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
 * `@repo/canvas` beside the rest of the geometry, which would settle a rail's height in the one
 * package that cannot see what has to fit inside it.
 *
 * Hand over the record that is rendered from, rather than a fresh literal at the call site: this type
 * cannot tell those apart, and a second literal is a band this reads and a band the SVG drew, free to
 * disagree. What the two sides each hold is the arithmetic — `railTop` there is the forward direction
 * and {@link railAtY} the inverse — and only a test that calls both can pin that, which belongs to the
 * component that first calls this.
 */
export interface RailMetrics {
  readonly chromeHeight: number

  readonly railHeight: number
}

/**
 * Everything answering one drag takes: where it ended, which feature is moving, and the layout it is
 * moving within.
 *
 * One object rather than a parameter list, so that the next input to turn out to be load-bearing is an
 * added field and not a re-shaped call. `featureId` is the one that was missing: the dragged feature is
 * still in `rails` while it is being dragged, and a number computed as though it were not moving is one
 * place too far — but only for a move along one rail that ends right of the dragged feature's own
 * place. A leftward move was never off by one, because the bar being dragged is then to the right of
 * the drop and counts towards nothing, and neither was a move onto another rail.
 *
 * `rails` is the whole `railLayout` result, and it is the only plan this reads. A `CanvasPlan` was here
 * too, for the two things this used to ask it — whether any epic claims the rail dropped on, and that
 * rail's stored feature order — and it is gone because a query could hold a layout of one plan beside a
 * different plan and get a confident placement rather than a complaint. A {@link RailBox} answers both:
 * `colour === null` is "no epic claims this rail", and `featureIds` is the order, derived by the
 * `railsOf` call the layout already made rather than by a second one here.
 */
export interface DropQuery {
  readonly point: DragPoint

  readonly featureId: string

  readonly rails: readonly RailBox[]

  readonly scale: PlanScale

  readonly metrics: RailMetrics
}

/**
 * A placement to send: the rail the dragged feature lands on, and the position to store it at.
 *
 * `epicId` because that is what names a rail — `packages/canvas/src/rails.ts` says why a rail has no
 * id of its own — and a position, because a placement is an order among siblings and never a date
 * (`docs/adr/0048-macroplan-schedules-it-does-not-store-dates.md`). The pair is
 * `FeaturePlacementPayload` in `packages/contracts/src/structure-payloads.ts`, and what makes the
 * number right or wrong is how the far end reads it: `placeAmong` in
 * `packages/macroplan-domain/src/services/positions.ts` takes it as an index among the siblings that
 * are left once the moved feature is lifted out. That is the reading {@link dropTargetFor} answers in.
 *
 * The two ends read one order, with one gap that is named here rather than handled: `railsOf` orders a
 * rail by `(position, id)` and `placeAmong` sorts by `position` alone, so on a rail holding two
 * features at one `position` the tie is broken by id at this end and by the manifest's array order at
 * the other, and one number can then name two different slots. Out of scope because a plan the domain
 * wrote carries no such tie — every write in `packages/macroplan-domain/src/services/` renumbers a
 * rail densely from zero, `placeAmong` and `densified` both ending in `numbered`, and a created
 * feature takes `railFeatures(...).length` off an already densified rail. A manifest that arrived with
 * one is corrupt in the same way a manifest with duplicate ids is, and neither end defends against it.
 *
 * Which of the rail's **bars** the drop fell in front of is not a field here. It was, under the name
 * `position`, and the two numbers differ on any rail carrying a feature the forward pass could not
 * place — `rails.ts` argues where it omits such a feature why it is drawn nowhere at all — so a bar
 * index sent as a placement moves the feature past a sibling the user cannot see. It is now a step
 * inside {@link dropTargetFor} that no caller can reach and no copy can carry off.
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
 * `rails` has to be the whole `railLayout` result, unfiltered and in the order it was drawn in: a rail
 * is identified here by its index in that array, and a {@link RailBox} carries no index of its own, so
 * a filtered or re-ordered array answers a different rail and nothing says it did. This is the inverse
 * of `railTop` in `apps/macroplan/components/plan/canvas/view.ts`, and it has to be handed the array
 * whose indices `railTop` was called with.
 *
 * Every edge belongs to the band below it — `top <= y < top + railHeight` — so no y falls in two
 * rails, and no y between the chrome and the last rail's bottom falls in none. Above the first rail
 * and from the last rail's bottom edge downward there is no rail, and the answer is `null` and not
 * the nearest one: {@link dropTargetFor} says what that refusal is for.
 *
 * Searches the rails that exist rather than dividing `y` by `railHeight`, and that is what bounds the
 * answer: the division has one for every y, including a negative index above the chrome and an index
 * past the last rail below it, and every caller would then owe the range check this owes once. The band
 * formula itself is not duplicated either way — `bandTop` above is that formula, written once.
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

const leftOfDrop =
  (x: number, dragged: number) =>
  (bar: FeatureBar, index: number): boolean =>
    index !== dragged && (bar.x < x || (bar.x === x && index < dragged))

function placeOf(rest: readonly string[], id: string): number {
  const found = rest.indexOf(id)
  if (found === -1) throw new Error(`a bar for ${id} was drawn on a rail that does not carry it`)
  return found
}

function landingAmong(
  rest: readonly string[],
  remaining: readonly FeatureBar[],
  gap: number,
  own: number,
): number {
  const ahead = remaining[gap]
  if (ahead !== undefined) return placeOf(rest, ahead.id)
  const last = remaining[remaining.length - 1]
  if (last !== undefined) return placeOf(rest, last.id) + 1
  return own === -1 ? rest.length : own
}

/**
 * The placement a drag names, or `null` when it names none.
 *
 * `null` is a real answer rather than a failure: the chrome band, the gutter left of day 0, everything
 * below the last rail, and a rail no epic in the plan claims are all places a drag can end, and what a
 * caller does at every one of them is cancel. Nothing clamps to the nearest rail — §6 of
 * `docs/superpowers/specs/2026-09-22-macroplan-design.md` records that "there is no packing algorithm
 * and nothing is ever auto-moved", and a clamp turns a mistaken drop into a move the user neither asked
 * for nor saw. The unclaimed rail refuses for a nearer reason: `rails.ts` lays one out for a feature
 * whose `epicId` names no epic, and `assertEpic` in
 * `packages/macroplan-domain/src/services/structure-mapper.ts` refuses that id, so there is no
 * placement there to answer with. Those four causes are not distinguished in the answer, and a caller
 * that wants to say which one it hit — "unclaimed rail" reads differently from "off the canvas" — has
 * the {@link RailBox} it passed in to read `colour === null` off, rather than a wider return type here.
 *
 * The rule is to land where the bar the drop fell in front of sits in the stored order, with the dragged
 * feature lifted out of that order first. Four things separate that from counting bars, and each of the
 * four was a number that looked right:
 *
 * - A rail's features are not its bars, so no count of bars is the answer. The bar the drop landed in
 *   front of is asked for its id, and the position is read off the feature carrying that id. On a rail
 *   holding a feature the pass could not place, the bar count is a place a sibling already holds: a drop
 *   past every bar sent as that count lands in front of the rail's last feature rather than after it.
 * - The dragged feature is lifted out of **both** lists, because a list without it is the one the far end
 *   counts in: its bar is not counted, and the feature it is is not ordered. Counting bars that still
 *   include the dragged one put every rightward move along one rail one place too far, and at the far
 *   right of a rail `placeAmong`'s clamp was all that hid it. Lifting it out of one list and not the
 *   other is the same bug in disguise: the same number for most drops, and "last on the rail" for a drag
 *   nudged short of its own bar, which is a drag that moved nothing.
 * - Bars can share an `x`. A zero-day milestone "has `start === end` … and moves no rail cursor"
 *   (`packages/schedule/src/forward-pass.ts`), so a rail opening with one draws two bars at one `x`, and
 *   "strictly left of the point" cannot tell them apart. At a tie the bars keep the order they already
 *   have, which is the only answer under which a drag dropped where it began moves nothing.
 * - Past the last remaining bar there is no bar to be in front of, and the answer is still a bar's
 *   place and not a count: one past where that last bar sits in the lifted-out order. The count of
 *   features was the fourth wrong number, and it is last on the rail — so on a rail whose stored order
 *   runs past its last bar, it jumped every sibling stored beyond that bar. With one bar on the rail it
 *   fired for every x, including the bar's own: that rail could not be moved and was reordered anyway.
 *
 * On a rail left with no bars at all there is nothing to read a place off, and the answer is the dragged
 * feature's own place in the stored order, which is the one number that puts it back where it was.
 * Nothing on that rail is drawn, so nothing on it was dropped in front of anything, and §9 of
 * `docs/superpowers/specs/2026-09-22-macroplan-design.md` gates this phase on "a test asserts nothing
 * auto-moves". For a feature not on that rail at all there is no own place, and the answer is last —
 * a drop on a rail drawn empty is the one case where the x says nothing and the only orders available
 * are first and last.
 *
 * `-1` from `findIndex` and `indexOf` is the sentinel for both of those, and it means two things worth
 * separating. `dragged` is `-1` when this rail draws no bar for the dragged feature, which covers a
 * feature on another rail and a feature on this one that the pass could not place; both want the same
 * thing, which is no bar excluded from the count. `own` is `-1` only for a feature this rail does not
 * carry at all.
 *
 * A bar whose id is in `bars` and not in `featureIds` cannot happen — `railLayout` builds both from one
 * rail — so `placeOf` throws rather than answering. The number it would otherwise have to invent is
 * "last on the rail", and answering a silent reorder on a corrupt layout is worse than failing.
 *
 * {@link xToDay} is asked for the one thing here that is a day — whether the x is on the axis at all —
 * which leaves where day 0 sits in the module that decides it.
 */
export function dropTargetFor(query: DropQuery): DropTarget | null {
  const { point, featureId } = query
  if (xToDay(point.x, query.scale) < 0) return null
  const rail = railAtY(point.y, query.rails, query.metrics)
  if (rail === null || rail.colour === null) return null
  const dragged = rail.bars.findIndex((bar) => bar.id === featureId)
  const own = rail.featureIds.indexOf(featureId)
  const gap = rail.bars.filter(leftOfDrop(point.x, dragged)).length
  const remaining = rail.bars.filter((_, index) => index !== dragged)
  const rest = rail.featureIds.filter((id) => id !== featureId)
  return { epicId: rail.epicId, position: landingAmong(rest, remaining, gap, own) }
}
