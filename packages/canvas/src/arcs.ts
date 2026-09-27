import type { IgnoredEdge } from '@repo/schedule'
import type { CanvasPlan } from './plan.js'
import type { RailMetrics } from './drag.js'
import type { FeatureBar, RailBox } from './rails.js'

/**
 * The vertical geometry an arc needs: a rail band's own two numbers, plus where a bar sits inside one.
 *
 * Extends {@link RailMetrics} rather than restating it, so a canvas already holding the record
 * `dropTargetFor` takes needs to add two fields and not a second object. `apps/macroplan`'s `LAYOUT`
 * satisfies this by construction — it already declares all four under these names, for the layer that
 * draws the bars this joins up.
 */
export interface ArcMetrics extends RailMetrics {
  /** The y of a bar's top, from its own rail band's top. */
  readonly barTop: number

  /** A bar's height, which fixes the y an arc leaves and arrives at as the bar's middle. */
  readonly barHeight: number
}

/**
 * One dependency edge as something drawable: which two features, where the curve runs, and the two
 * facts that change how it is drawn.
 *
 * `fromId` is the feature **depended on** and `toId` the one depending on it, so the arc runs the way
 * the work does — out of the end of what must finish first and into the start of what waits. That is
 * the opposite order from `dependsOn`, where the feature holding the array is `toId`, and it is worth
 * being deliberate about: an arc drawn the other way round would point from a consequence at its cause
 * on every rail of the plan and still look plausible.
 *
 * Both endpoints are carried beside {@link path} rather than left for a renderer to recover from the
 * string. An arrowhead is a `marker-end` and needs none of them, but a hover target, a label and a
 * test all want the two ends as numbers, and parsing them back out of a `d` attribute is the kind of
 * arithmetic this package exists to keep out of a component.
 */
export interface DependencyArc {
  /** The feature that must finish first — where the curve starts. */
  readonly fromId: string

  /** The feature that waits on it — where the curve ends. */
  readonly toId: string

  readonly fromX: number

  readonly fromY: number

  readonly toX: number

  readonly toY: number

  /**
   * An SVG cubic path from one end to the other, ready for a `d` attribute.
   *
   * A string and not four more control-point numbers, because the bow is the decision: which way an
   * arc bends, and how far it reaches before it turns, is geometry, and geometry belongs here under a
   * unit test rather than in JSX where `happy-dom` answers every measurement with a zero `DOMRect`.
   * A component that composed its own curve from control points would be making this decision again,
   * differently, at each rung.
   */
  readonly path: string

  /**
   * Whether the two ends sit on different rails, which is the arc worth looking at.
   *
   * Design §3.1: dependency edges "are the only thing that couples one rail to another, which is
   * exactly what makes the result look like a git graph". Within a rail an edge is usually already
   * implied by rail order and the arc is a short hop restating it; across rails it is the only reason
   * two lanes are not independent. A renderer is expected to weight the two differently, which is why
   * this is answered here and not inferred from `fromY !== toY` by each caller.
   */
  readonly crossesRails: boolean

  /**
   * Whether the forward pass **dropped** this edge to break a cycle.
   *
   * These are `ScheduleResult.ignoredEdges`, and the schedule on screen does not honour them: the
   * feature at `toId` was placed as though this dependency were not there. The conflict list already
   * says a cycle exists (ADR 0060), and drawing the dropped edge distinctly is what tells someone
   * *where* — an arc running backwards out of a later feature into an earlier one, which is the shape
   * a cycle has once the pass has cut it.
   */
  readonly ignored: boolean
}

/**
 * Everything {@link arcLayout} reads. One object rather than four parameters, as `DropQuery` is.
 *
 * `rails` is the whole `railLayout` result and is the only geometry this takes: every bar's `x` and
 * `width` are already on it, and a rail's index in the array is the rail's own position, which is what
 * fixes an arc's y. Re-deriving either from the plan would be a second total order over the same
 * features — the mistake `railLayout` names at length — and this one would put arcs on rails that bars
 * are not on.
 */
export interface ArcQuery {
  /** The plan, read for `features` and their `dependsOn` and nothing else. */
  readonly plan: CanvasPlan

  /** The rails as `railLayout` built them, in the order they are drawn in. */
  readonly rails: readonly RailBox[]

  /** Where a rail band and the bar inside it sit. */
  readonly metrics: ArcMetrics

  /**
   * The edges the pass dropped, from `ScheduleResult.ignoredEdges`.
   *
   * Required rather than defaulted to `[]`. A schedule that could hold a cycle always carries the
   * array — `CanvasScheduleWithConflicts` declares it — so every real caller has one in hand, and an
   * optional field here would let a canvas silently draw a cut edge as an ordinary dependency by
   * forgetting to pass something it already holds.
   */
  readonly ignoredEdges: readonly IgnoredEdge[]
}

/**
 * How far an arc reaches sideways before it turns, in px, when its two ends are close together.
 *
 * A cubic whose control points sit on its endpoints is a straight line, so an edge between two bars
 * that touch — the common case within a rail, where one feature starts the day the last one ends —
 * would have no curve to see at all. This is the floor that keeps such an arc visible as an arc.
 */
export const ARC_MIN_REACH = 18

/**
 * How high a same-rail arc bows above the bars, in px.
 *
 * Only same-rail arcs need it. Two ends on different rails already have different `y`s, so the curve
 * between them is visibly a curve; two ends on one rail would otherwise be a flat line lying along the
 * bars it connects, indistinguishable from the rail itself.
 */
export const ARC_LIFT = 14

interface Placed {
  readonly bar: FeatureBar
  readonly y: number
}

const centreY = (railIndex: number, metrics: ArcMetrics): number =>
  metrics.chromeHeight + railIndex * metrics.railHeight + metrics.barTop + metrics.barHeight / 2

const placedBars = (query: ArcQuery): ReadonlyMap<string, Placed> => {
  const placed = new Map<string, Placed>()
  query.rails.forEach((rail, railIndex) => {
    const y = centreY(railIndex, query.metrics)
    rail.bars.forEach((bar) => placed.set(bar.id, { bar, y }))
  })
  return placed
}

const edgeKey = (toId: string, fromId: string): string => `${toId}>${fromId}`

const pathOf = (from: Placed, to: Placed): string => {
  const fromX = from.bar.x + from.bar.width
  const toX = to.bar.x
  const reach = Math.max(ARC_MIN_REACH, (toX - fromX) / 2)
  const lift = from.y === to.y ? ARC_LIFT : 0
  const control = `${String(fromX + reach)} ${String(from.y - lift)} ${String(toX - reach)} ${String(to.y - lift)}`
  return `M ${String(fromX)} ${String(from.y)} C ${control} ${String(toX)} ${String(to.y)}`
}

interface ArcContext {
  readonly placed: ReadonlyMap<string, Placed>
  readonly ignored: ReadonlySet<string>
}

const arcOf = (toId: string, fromId: string, context: ArcContext): DependencyArc | null => {
  const from = context.placed.get(fromId)
  const to = context.placed.get(toId)
  if (from === undefined || to === undefined) return null
  return {
    fromId,
    toId,
    fromX: from.bar.x + from.bar.width,
    fromY: from.y,
    toX: to.bar.x,
    toY: to.y,
    path: pathOf(from, to),
    crossesRails: from.y !== to.y,
    ignored: context.ignored.has(edgeKey(toId, fromId)),
  }
}

/**
 * Every dependency edge of the plan as an arc, in `plan.features` order and then `dependsOn` order.
 *
 * ### What is left out, and why it is not an error
 *
 * An edge is drawn only when **both** ends got a bar. A feature with no estimate is not on the axis at
 * all — the pass reports it in `unscheduled` with a reason and `railLayout` omits it — so there is no
 * position for an arc to reach, and the two alternatives are both worse than silence: an arc to the
 * gutter would point at a stub whose x means "nth unplaced", not a day, and an arc to day zero would
 * assert a schedule nothing computed. `UnplacedFeatures` already says the feature exists and is not
 * placed, in words, which is the honest rendering of an edge one end of which is nowhere.
 *
 * An edge naming a feature the plan does not hold drops out through the same test, with nothing
 * written here to check for it.
 *
 * ### Order, and why it is the plan's and not the layout's
 *
 * `plan.features` order, which is the API's array order and not the derived rail order `railLayout`
 * imposes. Arcs are drawn into one layer over the whole canvas rather than into a rail, so there is no
 * rail to group them under and nothing downstream reads their order — unlike `RailBox.bars`, whose
 * non-decreasing `x` is a promise a caller relies on. Taking the plan's own order means this makes no
 * ordering decision at all, which is one fewer total order over the same features to disagree with the
 * one `railLayout` owns.
 *
 * ### Purity
 *
 * Nothing is mutated. Both maps are built here from the arguments and neither argument is written to.
 */
export function arcLayout(query: ArcQuery): readonly DependencyArc[] {
  const context: ArcContext = {
    placed: placedBars(query),
    ignored: new Set(query.ignoredEdges.map((edge) => edgeKey(edge.featureId, edge.dependsOnId))),
  }
  return query.plan.features.flatMap((feature) =>
    feature.dependsOn.flatMap((dependsOnId) => arcOf(feature.id, dependsOnId, context) ?? []),
  )
}
