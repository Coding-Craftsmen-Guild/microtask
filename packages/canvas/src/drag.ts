import type { FeatureBar, RailBox } from './rails.js'
import { xToDay } from './scale.js'
import type { PlanScale } from './scale.js'

/**
 * Where the drag ended, in the canvas's own coordinate space — the space a bar's `x` and a rail's
 * band are both measured in.
 *
 * Neither field is the pointer's own position: both have the offset the drag was grabbed at
 * subtracted, and what is left differs between them, because the two numbers are compared against
 * different things.
 *
 * `x` is the dragged bar's **left edge**: `pointerX - (pointerDownX - bar.x)`. {@link dropTargetFor}
 * compares it against each bar's `x`, and a bar's `x` is its left edge
 * (`packages/canvas/src/rails.ts`), so that subtraction is what has the two sides measuring one
 * thing. Handing over a raw pointer x instead reads as a drag that travelled that offset further than
 * it did, so "dropped where it began changes nothing" fails by it — up to a whole bar's width for a
 * bar grabbed at its right end, which on a dense rail is several days and several siblings.
 *
 * `y` cannot be that same sentence, because a {@link FeatureBar} has no `y` to subtract: where a bar
 * sits inside its rail's band is the renderer's own business — `barTop` and `barHeight` are fitted to a
 * type size {@link RailMetrics} deliberately does not carry — and this package never sees it. So `y` is
 * the y the dragged bar's band-relative **centre** landed at:
 * `pointerY - (pointerDownY - railTop(the rail the drag started on)) + railHeight / 2`, with `railTop`
 * the forward direction of {@link railAtY} in `apps/macroplan/components/plan/canvas/view.ts`. A drag of
 * zero pixels hands in the middle of the band it began in, so {@link railAtY} answers the rail the drag
 * started on, which is what "dropped where it began changes nothing" needs on this axis too.
 *
 * The half band is the **reason for the offset and not a fudge**: it is what puts the handoff half a
 * band away in each direction. `railHeight / 2` of downward travel reaches the rail below, and anything
 * more than `railHeight / 2` upward reaches the rail above — the one extra pixel going up is the
 * half-open band, whose own top edge {@link railAtY} gives to the band below it. Two alternatives were
 * refused for being asymmetric in ways nobody chose. Subtracting the band-relative offset and stopping
 * there rests a bar on its band's top edge, which makes the rail below a full `railHeight` of travel
 * away and the rail above one pixel: a bar nudged up by one would change rails. Handing in the bar's top
 * edge unadjusted, and letting {@link railAtY} compare it against band tops, makes the handoff `barTop`
 * up and `railHeight - barTop` down — 17px and 42px at that file's `LAYOUT` — an asymmetry set by
 * exactly the two constants this package is not given. Half a band needs only `railHeight`, which
 * {@link RailMetrics} does carry.
 *
 * Handing over a raw pointer y is the same class of error as handing over a raw pointer x, and the
 * component that first turns an event into one of these is in a position to make both. The pointer sits
 * `barTop` plus the grab offset inside the bar below its band's top, so the whole reading is shifted
 * down by that much: the rail below is then `railHeight - barTop - grab` of travel away instead of half
 * a band, so the same drag from the same pixel names a different rail depending on where inside the bar
 * it was grabbed — 42px down for a bar taken by its top edge against 24px for one taken by its bottom,
 * a whole bar's height of difference at that `LAYOUT`. On a band no taller than `barTop + barHeight` it
 * is worse than asymmetric: a drag that moved nothing at all names the rail below.
 *
 * Not a pointer event and not a rect. Turning one event into one of these — that arithmetic
 * included — is the step no test in this repository can check:
 * `docs/adr/0055-canvas-geometry-is-its-own-pure-package.md` records why, and it is the same reason
 * everything here is arithmetic over numbers. Deciding what to do with the answer is a client
 * component's own work, and so is the request it sends.
 */
export interface DragPoint {
  /** The dragged bar's left edge, which is the pointer's x less the grab offset inside the bar. */
  readonly x: number

  /**
   * Where the dragged bar's band-relative centre landed: the pointer's y less the grab offset within
   * the rail band, plus half a rail's height. A drag of zero pixels is the middle of its own band.
   */
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
 *
 * That first equivalence holds of a box `railLayout` built, and holds because of two things together:
 * `CanvasEpic.colour` is a non-nullable `string` (`packages/canvas/src/plan.ts`), and the map a box's
 * colour is looked up in is built from `plan.epics` and nothing else — so the only `null` such a box
 * can carry is the missing entry for an `epicId` no epic declared, never an epic that declared no
 * colour. A box assembled by hand can of course carry `null` beside an epic the plan does have, and
 * {@link dropTargetFor} then refuses that rail: it reads the box it was handed, which is the whole
 * point of taking one.
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

function placeOf(rest: readonly string[], id: string, epicId: string): number {
  const found = rest.indexOf(id)
  if (found === -1)
    throw new Error(`a bar for ${id} was drawn on rail ${epicId}, which does not carry it`)
  return found
}

interface Lifted {
  readonly epicId: string
  readonly rest: readonly string[]
  readonly remaining: readonly FeatureBar[]
  readonly gap: number
  readonly own: number
}

function landingAmong(lifted: Lifted): number {
  const { epicId, rest, remaining, gap, own } = lifted
  const ahead = remaining[gap]
  const behind = gap === 0 ? undefined : remaining[gap - 1]
  const lower = behind === undefined ? 0 : placeOf(rest, behind.id, epicId) + 1
  const upper = ahead === undefined ? rest.length : placeOf(rest, ahead.id, epicId)
  if (own !== -1 && own >= lower && own <= upper) return own
  if (ahead !== undefined) return upper
  return remaining.length === 0 ? rest.length : lower
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
 * The rule is one sentence. **A drop names the gap between two adjacent bars the rail draws** — the
 * nearest bar left of the x and the nearest bar right of it, with the dragged feature's own bar lifted
 * out before either is looked for — and the answer is a slot inside that gap, expressed in the stored
 * order with the dragged feature lifted out of that too. Every slot inside one gap is drawn in the
 * same place, because a sibling stored between two *adjacent* bars is by definition one the forward
 * pass could not place and `rails.ts` therefore drew nowhere. So when the dragged feature's own slot
 * is already inside the gap, the answer is that slot and nothing moves: §9 of
 * `docs/superpowers/specs/2026-09-22-macroplan-design.md` gates this phase on "a test asserts nothing
 * auto-moves", and a drop inside the gap a feature was already in is a drop whose result the user
 * could not have seen.
 *
 * Wherever the gap has a bar at an end, that end is a place read off that bar's id and never a count —
 * the place of the bar ahead, and one past the place of the bar behind. Five numbers have stood here,
 * and each of the five was a special case of the sentence above that looked right on its own:
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
 * - Past the last remaining bar there is no bar ahead, and the gap's far end is then the end of the
 *   order — but its near end is still a bar's place and not a count: one past where the last bar sits
 *   in the lifted-out order. The count of features was the fourth wrong number, and it is last on the
 *   rail — so on a rail whose stored order runs past its last bar, it jumped every sibling stored
 *   beyond that bar. With one bar on the rail it fired for every x, including the bar's own: that rail
 *   could not be moved and was reordered anyway.
 * - Taking one **end** of the gap as the whole answer was the fifth, and it is where the four above
 *   converge. The far end jumps every sibling stored between the bar behind and the bar ahead; the near
 *   end drags the feature back over those same siblings; and neither asks what the rule asks, which is
 *   whether the feature is inside the gap already. A rail whose middle feature has no estimate yet — an
 *   ordinary state, and the one shape this function's fixture had never held — therefore reordered on a
 *   drag of zero pixels at both of its bars, the first forward over that sibling and the second back
 *   over it, and by two places where two such siblings are stored.
 *
 * A rail left with **no bars after the lift-out** is that same sentence and not an exception: with no
 * bar behind and none ahead, the gap is the whole rail, so every slot is inside it and the dragged
 * feature's own slot is the answer. That covers a rail drawing nothing at all and a rail drawing
 * exactly one bar — the dragged one — which is where the count of features last reordered a rail
 * nothing could be moved on. What is true of such a rail is not that its orders are limited: on a rail
 * left with `n` siblings every slot from 0 to `n` is available, and the answer is one of them. It is
 * that the **x carries no information**, there being no bar to have landed in front of, so every x on
 * the rail answers the same slot rather than a placement invented from the pixels. A feature the rail
 * does not carry has no own slot and lands last, which is where this product puts work arriving on a
 * rail: §6 of the spec has new work "append after the last sibling".
 *
 * `-1` from `findIndex` and `indexOf` is what "no bar" and "no own slot" both arrive as, and the two are
 * worth separating. `dragged` is `-1` when this rail draws no bar for the dragged feature, which covers a
 * feature on another rail and a feature on this one that the pass could not place; both want the same
 * thing, which is no bar excluded from the count. `own` is `-1` only for a feature this rail does not
 * carry at all.
 *
 * A bar whose id is in `bars` and not in `featureIds` cannot happen — `railLayout` builds both from one
 * rail — so `placeOf` throws rather than answering, naming the rail as well as the bar, because a
 * caller holding a whole layout cannot tell from the id alone which box it built wrong. The number it
 * would otherwise have to invent is "last on the rail", and answering a silent reorder on a corrupt
 * layout is worse than failing.
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
  const lifted: Lifted = {
    epicId: rail.epicId,
    rest: rail.featureIds.filter((id) => id !== featureId),
    remaining: rail.bars.filter((_, index) => index !== dragged),
    gap: rail.bars.filter(leftOfDrop(point.x, dragged)).length,
    own: rail.featureIds.indexOf(featureId),
  }
  return { epicId: rail.epicId, position: landingAmong(lifted) }
}
