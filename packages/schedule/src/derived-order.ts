import type { PlanStructure, ScheduleFeature, ScheduleItem } from './structure.js'

const UNRANKED = Number.MAX_SAFE_INTEGER

function compare(left: readonly [number, string], right: readonly [number, string]): number {
  if (left[0] !== right[0]) return left[0] - right[0]
  if (left[1] === right[1]) return 0
  return left[1] < right[1] ? -1 : 1
}

function groupBy<T>(all: readonly T[], keyOf: (one: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const one of all) {
    const under = grouped.get(keyOf(one)) ?? []
    under.push(one)
    grouped.set(keyOf(one), under)
  }
  return grouped
}

/**
 * The plan's features as rails: epics in `(railOrder, id)` order, each rail's features in
 * `(position, id)` order.
 *
 * Both keys are pairs rather than single numbers because neither `railOrder` nor `position` is
 * guaranteed distinct — two features dropped into the same slot would otherwise be ordered by
 * whichever the array happened to hold first, and the forward pass would answer differently for
 * two manifests describing the same plan. Ids break every tie, so the order is total.
 *
 * A feature whose `epicId` names no epic still forms a rail of its own, ordered after every real
 * one: the forward pass must place every feature it is given, and a rail that no epic claims is
 * still a rail. Neither the plan nor any array in it is written to; every sort runs on a copy.
 *
 * Exported so `@repo/canvas` can draw against the exact order the forward pass placed spans in,
 * rather than re-deriving a total order that a second package's tests cannot check against the
 * first's — a mismatch there is a bar drawn on the wrong rail.
 */
export function railsOf(plan: PlanStructure): readonly (readonly ScheduleFeature[])[] {
  const rank = new Map(plan.epics.map((epic) => [epic.id, epic.railOrder]))
  return [...groupBy(plan.features, (feature) => feature.epicId).entries()]
    .sort(([left], [right]) =>
      compare([rank.get(left) ?? UNRANKED, left], [rank.get(right) ?? UNRANKED, right]),
    )
    .map(([, rail]) =>
      rail.sort((left, right) => compare([left.position, left.id], [right.position, right.id])),
    )
}

/**
 * The plan's items grouped under their `featureId`, each group in `(position, id)` order — the
 * order they flow in inside their feature, and tie-broken by id for the same reason rails are.
 *
 * An item naming a feature the plan does not hold is grouped under that id like any other and is
 * simply never asked for, which is how it stays out of the answer without anything having to
 * check for it.
 */
export function itemsByFeature(plan: PlanStructure): ReadonlyMap<string, readonly ScheduleItem[]> {
  const grouped = groupBy(plan.items, (item) => item.featureId)
  for (const under of grouped.values()) {
    under.sort((left, right) => compare([left.position, left.id], [right.position, right.id]))
  }
  return grouped
}
