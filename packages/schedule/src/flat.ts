import { schedule } from './forward-pass.js'
import type { Cycle, IgnoredEdge, PlanStructure, Span, Unscheduled } from './structure.js'

/** One feature or item on the axis, naming its own id, in working-day offsets. */
export interface FlatSpan extends Span {
  readonly id: string
}

/**
 * A schedule as a response carries it and as a browser recomputes it: spans, cycles, unscheduled entries
 * and dropped edges, every list in a total order.
 */
export interface FlatSchedule {
  readonly spans: readonly FlatSpan[]
  readonly cycles: readonly Cycle[]
  readonly unscheduled: readonly Unscheduled[]
  readonly ignoredEdges: readonly IgnoredEdge[]
}

const compare = (left: string, right: string): number => {
  if (left === right) return 0
  return left < right ? -1 : 1
}

const bySpan = (left: FlatSpan, right: FlatSpan): number =>
  left.startDay - right.startDay || compare(left.id, right.id)

const byId = (left: Unscheduled, right: Unscheduled): number => compare(left.id, right.id)

/**
 * The forward pass, flattened and ordered so that two callers computing it agree byte for byte.
 *
 * ### Why it lives here and not in `@repo/macroplan-domain`
 *
 * It has two callers on opposite sides of the API, which is the reason this package exists at all
 * (ADR 0049). The API answers every plan with this view, and the plan screen now recomputes it in the
 * browser for an optimistic edit — the bar has to move the moment it is dropped, before the answer
 * arrives (ADR 0069). Two copies of the flattening would be two orders, and the browser's would be
 * replaced by the server's a round trip later: every edit would flicker by however far the two had
 * drifted. One function is what makes the optimistic plan and the answered plan the same plan.
 *
 * ### Why it sorts
 *
 * `days` is a `Map`, so its iteration order is the order the pass happened to place things in, and a
 * response ordered by an implementation detail of a traversal is one no agreement test can pin.
 * `(startDay, id)` gives spans a total order — ties on a day are common, since every rail starts at day
 * 0 — and `unscheduled` sorts by id. `cycles` and `ignoredEdges` pass through: `findCycles` already sorts
 * ids within a cycle and cycles by first id, and the pass sorts dropped edges by
 * `(featureId, dependsOnId)`.
 *
 * @param plan - The structure to schedule: calendar, rails, features and items.
 * @returns The schedule in the order every caller agrees on.
 */
export function flatSchedule(plan: PlanStructure): FlatSchedule {
  const result = schedule(plan)
  return {
    spans: [...result.days]
      .map(([id, span]) => ({ id, startDay: span.startDay, endDay: span.endDay }))
      .sort(bySpan),
    cycles: result.cycles,
    unscheduled: [...result.unscheduled].sort(byId),
    ignoredEdges: result.ignoredEdges,
  }
}
