import { arcLayout } from '@repo/canvas'
import type { ArcMetrics, DependencyArc, RailBox } from '@repo/canvas'
import { NODE_RADIUS, pointX } from './mark-metrics'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * One arc as this canvas draws it: the geometry, plus the two facts that come off the feature it
 * leaves.
 *
 * ### Why both are the **source** feature's
 *
 * An arc runs out of what must finish first and into what waits. Those two ends may be on different
 * rails and in different groups, so one colour and one group can only honestly name one of them —
 * and the one worth naming is where the arc begins: an arc leaving a rail is that rail's thread
 * continuing somewhere else, which is the thing a reader is trying to follow.
 *
 * `labelId` is what lets a chosen group keep its own outgoing arcs lit while the rest of the plan
 * dims (`labels/group-css.ts`). Dimming every arc whose two ends are not both in the group would
 * hide exactly the edges that say what a phase blocks.
 */
export interface CanvasArc extends DependencyArc {
  /** The rail colour of the feature this arc leaves, or `null` for a rail no epic claims. */
  readonly colour: string | null

  /** The group of the feature this arc leaves, or `null` for one in no group. */
  readonly labelId: string | null
}

function huesOf(rails: readonly RailBox[]): ReadonlyMap<string, string | null> {
  return new Map(rails.flatMap((rail) => rail.featureIds.map((id) => [id, rail.colour] as const)))
}

function groupsOf(plan: PlanScreenModel): ReadonlyMap<string, string | null> {
  return new Map(plan.features.map((feature) => [feature.id, feature.labelId] as const))
}

const asPoints = (rails: readonly RailBox[]): readonly RailBox[] =>
  rails.map((rail) => ({
    ...rail,
    bars: rail.bars.map((bar) => ({ ...bar, x: pointX(bar) - NODE_RADIUS, width: NODE_RADIUS * 2 })),
  }))

function fromSource(
  arcs: readonly DependencyArc[],
  hues: ReadonlyMap<string, string | null>,
  groups: ReadonlyMap<string, string | null>,
): readonly CanvasArc[] {
  return arcs.map((arc) => ({
    ...arc,
    colour: hues.get(arc.fromId) ?? null,
    labelId: groups.get(arc.fromId) ?? null,
  }))
}

/**
 * Every dependency of the plan as an arc, over rails the layout has already placed.
 *
 * Thin on purpose: the geometry is `arcLayout`'s, in a package with no DOM (ADR 0055), and all this
 * adds is what comes off the plan a surface is holding — the features, the edges the forward pass
 * dropped, and the hue and group of the feature each arc leaves.
 *
 * ### Why the hue is joined here and not in `@repo/canvas`
 *
 * A colour is not geometry. ADR 0055 splits the two — "the package holds what is arithmetic over the
 * model; the app holds what this screen chose" — and which channel carries which meaning is as
 * chosen as a decision gets: design §5 gives hue to the track and treatment to the status, and
 * `labels/group-css.ts` records that a group's colour now outranks a rail's on a bar. None of that is
 * derivable from a `DependencyArc`.
 *
 * The hue is read off the **rail** rather than off `plan.epics`, so an arc and the bar it leaves take
 * their colour from one place: `RailBox.colour` is already `null` for a rail no epic claims, which is
 * the one case with no hue to take, and re-deriving it here would be a second opinion about which
 * rail a feature is on.
 *
 * ### Why `ignoredEdges` is read here and not passed in
 *
 * `plan.schedule` is the whole schedule the API answered, cycles and dropped edges included, and it is
 * already on the model every surface here is handed. A caller threading `ignoredEdges` down separately
 * would be a second place for them to arrive from, and the failure would be silent in the worst way: a
 * cut edge drawn as an ordinary dependency looks like a schedule that honours it.
 *
 * ### Why the metrics are a parameter
 *
 * `LAYOUT` lives in `./view.ts`, which calls this. Reading it here instead would make the two modules
 * import each other, so the caller that owns the record passes it — and the record satisfies
 * {@link ArcMetrics} by construction, which is what its `satisfies` clause now says.
 *
 * ### Why the stop's own mark decides where an arc lands
 *
 * `arcLayout` leaves a bar at `x + width` and arrives at the next one's `x`. That is right for a stop
 * drawing the span and wrong for one drawing a point in the middle of it: two features along one rail
 * **touch** — one ends the day the next begins — so both ends of the curve were the same x, and a
 * cubic whose ends are one point is a 36px loop drawn in the layer *under* the marks. Every
 * dependency within a rail was therefore invisible at both wider stops, which is the defect `points`
 * closes.
 *
 * It closes it by shrinking each bar to the box of the point drawn over it before handing the rails on,
 * so the arc leaves the right edge of one dot and arrives at the left edge of the next — two x's that
 * differ whenever the features do — with no special case inside `@repo/canvas`. The **real** rails are
 * untouched, so the marks, the drag and the draw handles keep the span's own geometry
 * (`./feature-point.tsx`), and the hues and groups below are read off those rails rather than the
 * shrunk ones.
 */
export const canvasArcs = (
  plan: PlanScreenModel,
  rails: readonly RailBox[],
  metrics: ArcMetrics,
  points: boolean,
): readonly CanvasArc[] =>
  fromSource(
    arcLayout({
      plan,
      rails: points ? asPoints(rails) : rails,
      metrics,
      ignoredEdges: plan.schedule.ignoredEdges,
    }),
    huesOf(rails),
    groupsOf(plan),
  )
