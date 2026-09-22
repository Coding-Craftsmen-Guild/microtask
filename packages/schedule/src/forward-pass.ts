import { findCycles } from './cycles.js'
import { itemsByFeature, railsOf } from './derived-order.js'
import { effectiveEstimate } from './estimate.js'
import type {
  PlanStructure,
  ScheduleFeature,
  ScheduleItem,
  ScheduleResult,
  Span,
  Unscheduled,
  UnscheduledReason,
} from './structure.js'

interface Node {
  readonly feature: ScheduleFeature
  readonly estimate: number
  readonly waitsFor: readonly string[]
  startDay: number
  endDay: number
  placed: boolean
}

interface Sheet {
  readonly days: Map<string, Span>
  readonly unscheduled: Unscheduled[]
}

interface Pass {
  readonly items: ReadonlyMap<string, readonly ScheduleItem[]>
  readonly placed: ReadonlyMap<string, Node>
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

function nodesOf(
  rails: readonly (readonly ScheduleFeature[])[],
  estimates: ReadonlyMap<string, number>,
): readonly Node[] {
  const nodes: Node[] = []
  for (const rail of rails) {
    let behind: string | null = null
    for (const feature of rail) {
      const estimate = estimates.get(feature.id)
      if (estimate === undefined) continue
      const waits = feature.dependsOn.filter((id) => estimates.has(id))
      const waitsFor = behind === null ? waits : [behind, ...waits]
      nodes.push({ feature, estimate, waitsFor, startDay: 0, endDay: 0, placed: false })
      behind = feature.id
    }
  }
  return nodes
}

function place(node: Node, nodes: ReadonlyMap<string, Node>, sprintLengthDays: number): void {
  const pin = node.feature.pinSprint
  const bounds = [0, pin === null ? 0 : pin * sprintLengthDays]
  for (const id of node.waitsFor) {
    const waited = nodes.get(id)
    if (waited?.placed === true) bounds.push(waited.endDay)
  }
  node.startDay = Math.max(...bounds)
  node.endDay = node.startDay + node.estimate
  node.placed = true
}

function ready(node: Node, nodes: ReadonlyMap<string, Node>): boolean {
  return node.waitsFor.every((id) => nodes.get(id)?.placed !== false)
}

function placeAll(ordered: readonly Node[], sprintLengthDays: number): ReadonlyMap<string, Node> {
  const nodes = new Map(ordered.map((node) => [node.feature.id, node]))
  let unplaced = ordered.length
  while (unplaced > 0) {
    const before = unplaced
    for (const node of ordered) {
      if (node.placed || !ready(node, nodes)) continue
      place(node, nodes, sprintLengthDays)
      unplaced -= 1
    }
    if (unplaced === before) unplaced -= released(ordered, nodes, sprintLengthDays)
  }
  return nodes
}

function released(
  ordered: readonly Node[],
  nodes: ReadonlyMap<string, Node>,
  sprintLengthDays: number,
): number {
  const stalled = ordered.find((node) => !node.placed)
  if (stalled === undefined) return 0
  place(stalled, nodes, sprintLengthDays)
  return 1
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
  const node = pass.placed.get(feature.id)
  if (node === undefined) {
    const reason: UnscheduledReason = pass.inCycle.has(feature.id) ? 'in-cycle' : 'no-estimate'
    sheet.unscheduled.push({ id: feature.id, reason })
    for (const item of items) sheet.unscheduled.push({ id: item.id, reason })
    return
  }
  sheet.days.set(feature.id, { startDay: node.startDay, endDay: node.endDay })
  writeItems(sheet, node.startDay, items)
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
 * unestimated feature is ignored: it cannot contribute a date, and refusing the whole plan over it
 * would leave the canvas blank. `start` is the greatest of 0, every predecessor's `end` and
 * `pinSprint * sprintLengthDays`; a pin is one more lower bound and can only ever delay. `end` is
 * `start + effectiveEstimate` and is **exclusive**, so a zero-day milestone has `start === end`,
 * belongs in `days` rather than `unscheduled`, and moves no rail cursor.
 *
 * Rail order and dependencies can contradict each other — a feature depending on one that sits
 * later on its own rail, or two rails waiting on each other's tails — and such a plan has no
 * arrangement that satisfies both. Rather than refuse it, the pass keeps rail order, which is what
 * the drawing is made of, and drops the dependency edges that close the deadlock: it releases the
 * stalled feature earliest in derived order, ignoring what it still waits on. Every edge that runs
 * **forward** through that same derived order is therefore always honoured, and only an edge
 * pointing backwards through a plan that already disagrees with itself is ever lost.
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
  const ordered = nodesOf(rails, estimatesOf(rails, items, inCycle))
  const pass: Pass = { items, inCycle, placed: placeAll(ordered, plan.sprintLengthDays) }
  const sheet: Sheet = { days: new Map(), unscheduled: [] }
  for (const rail of rails) {
    for (const feature of rail) writeFeature(sheet, pass, feature)
  }
  return { days: sheet.days, cycles, unscheduled: sheet.unscheduled.sort(byId) }
}
