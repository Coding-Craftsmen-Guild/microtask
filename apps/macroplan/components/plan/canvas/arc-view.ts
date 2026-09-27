import { arcLayout } from '@repo/canvas'
import type { ArcMetrics, DependencyArc, RailBox } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'

/**
 * Every dependency of the plan as an arc, over rails the layout has already placed.
 *
 * Thin on purpose: the geometry is `arcLayout`'s, in a package with no DOM (ADR 0055), and all this
 * adds is the two things that come off the plan a surface is holding — the features, and the edges the
 * forward pass dropped.
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
 */
export const canvasArcs = (
  plan: PlanScreenModel,
  rails: readonly RailBox[],
  metrics: ArcMetrics,
): readonly DependencyArc[] =>
  arcLayout({ plan, rails, metrics, ignoredEdges: plan.schedule.ignoredEdges })
