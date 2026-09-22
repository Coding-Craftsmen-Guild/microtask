import { findCycles } from './cycles.js'
import { itemsByFeature, railsOf } from './derived-order.js'
import { effectiveEstimate } from './estimate.js'
import { relax } from './relax.js'
import type {
  PlanStructure,
  ScheduleFeature,
  ScheduleItem,
  ScheduleResult,
  Span,
  Unscheduled,
  UnscheduledReason,
} from './structure.js'

interface Sheet {
  readonly days: Map<string, Span>
  readonly unscheduled: Unscheduled[]
}

interface Pass {
  readonly items: ReadonlyMap<string, readonly ScheduleItem[]>
  readonly placed: ReadonlyMap<string, Span>
  readonly inCycle: ReadonlySet<string>
}

function estimatesOf(
  rails: readonly (readonly ScheduleFeature[])[],
  items: ReadonlyMap<string, readonly ScheduleItem[]>,
  inCycle: ReadonlySet<string>,
): Map<string, number> {
  const estimates = new Map<string, number>()
  for (const rail of rails) {
    for (const feature of rail) {
      const estimate = inCycle.has(feature.id)
        ? null
        : effectiveEstimate(feature, items.get(feature.id) ?? [])
      if (estimate !== null) estimates.set(feature.id, estimate)
    }
  }
  return estimates
}

function writeItems(sheet: Sheet, from: number, items: readonly ScheduleItem[]): void {
  let cursor = from
  for (const item of items) {
    if (item.estimateDays === null) {
      sheet.unscheduled.push({ id: item.id, reason: 'no-estimate' })
      continue
    }
    sheet.days.set(item.id, { startDay: cursor, endDay: cursor + item.estimateDays })
    cursor += item.estimateDays
  }
}

function writeFeature(sheet: Sheet, pass: Pass, feature: ScheduleFeature): void {
  const items = pass.items.get(feature.id) ?? []
  const span = pass.placed.get(feature.id)
  if (span === undefined) {
    const reason: UnscheduledReason = pass.inCycle.has(feature.id) ? 'in-cycle' : 'no-estimate'
    sheet.unscheduled.push({ id: feature.id, reason })
    for (const item of items) sheet.unscheduled.push({ id: item.id, reason })
    return
  }
  sheet.days.set(feature.id, span)
  writeItems(sheet, span.startDay, items)
}

function byId(left: Unscheduled, right: Unscheduled): number {
  if (left.id === right.id) return 0
  return left.id < right.id ? -1 : 1
}

/**
 * Places every feature and item on a working-day axis, in one pass.
 *
 * Never throws and never partially fails: a structure with a cycle, a dangling edge, a missing
 * estimate or no epics at all returns a result describing exactly that.
 *
 * Order is derived and total, never the order the arrays arrived in — rails by `(railOrder, id)`,
 * features by `(position, id)` within a rail, items by `(position, id)` within a feature — so two
 * manifests holding the same plan in a different order answer the same spans, down to the
 * insertion order of `days`. A feature whose `epicId` names no epic still forms a rail of its own,
 * ordered last, because a result that quietly omitted it would be worse than one that places it.
 *
 * Each schedulable feature waits on the nearest **earlier schedulable** feature of its rail, so an
 * unestimated or in-cycle feature does not cut the chain between its neighbours, and on every
 * `dependsOn` it names that is schedulable too. An edge to an unknown id, a cycle member or an
 * unestimated feature is ignored and is not reported in `ignoredEdges`: it could contribute no
 * date, and `cycles` and `unscheduled` already say why. `start` is the greatest of 0, every
 * predecessor's `end` and `pinSprint * sprintLengthDays`; a pin is one more lower bound and can
 * only ever delay. `end` is `start + effectiveEstimate` and is **exclusive**, so a zero-day
 * milestone has `start === end`, belongs in `days` rather than `unscheduled`, and moves no rail
 * cursor.
 *
 * Rail order and a dependency can contradict each other, and such a plan has no arrangement that
 * satisfies both. Rail order wins, and what it drops to get there is never a rail predecessor and
 * never a dependency running forward through derived order — only ever one running backward
 * through it, since the edge dropped is always the one from the earliest unplaced feature to
 * something derived order has not placed yet either. That dependency comes back in `ignoredEdges`
 * instead of disappearing; `relax` is where the mechanics live.
 *
 * Items flow inside their feature from its start, each after the last; an unestimated item is
 * unscheduled, contributes nothing and does not interrupt the flow. A feature's span is therefore
 * always exactly its estimated items laid end to end, which is what lets an edge between two
 * features mean something at the year rung.
 *
 * Ids are assumed unique and the assumption is not defended: like `findCycles`, this indexes
 * features into a `Map`, so a repeated id keeps the last one's edges and both copies read the same
 * span. A manifest with duplicate ids is corrupt, `schedule` must stay total, and this is not the
 * place to refuse one. Items naming no known feature have no anchor to flow from and appear in
 * neither `days` nor `unscheduled`, for the same reason.
 *
 * Nothing here writes to the plan: every sort runs on a copy.
 */
export function schedule(plan: PlanStructure): ScheduleResult {
  const cycles = findCycles(plan.features)
  const rails = railsOf(plan)
  const items = itemsByFeature(plan)
  const inCycle = new Set(cycles.flatMap((cycle) => [...cycle.featureIds]))
  const { spans, ignoredEdges } = relax(
    rails,
    estimatesOf(rails, items, inCycle),
    plan.sprintLengthDays,
  )
  const sheet: Sheet = { days: new Map(), unscheduled: [] }
  const pass: Pass = { items, inCycle, placed: spans }
  for (const rail of rails) {
    for (const feature of rail) writeFeature(sheet, pass, feature)
  }
  return { days: sheet.days, cycles, unscheduled: sheet.unscheduled.sort(byId), ignoredEdges }
}
