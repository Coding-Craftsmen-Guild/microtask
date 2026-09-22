import type { IgnoredEdge, ScheduleFeature, Span } from './structure.js'

interface Node {
  readonly feature: ScheduleFeature
  readonly estimate: number
  readonly waitsFor: readonly string[]
  startDay: number
  endDay: number
  placed: boolean
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

function abandoned(node: Node, nodes: ReadonlyMap<string, Node>): readonly IgnoredEdge[] {
  return node.waitsFor
    .filter((id) => nodes.get(id)?.placed === false)
    .map((id) => ({ featureId: node.feature.id, dependsOnId: id }))
}

function released(
  ordered: readonly Node[],
  nodes: ReadonlyMap<string, Node>,
  sprintLengthDays: number,
): readonly IgnoredEdge[] {
  const stalled = ordered.find((node) => !node.placed)
  if (stalled === undefined) return []
  const dropped = abandoned(stalled, nodes)
  place(stalled, nodes, sprintLengthDays)
  return dropped
}

function byEdge(left: IgnoredEdge, right: IgnoredEdge): number {
  if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1
  if (left.dependsOnId === right.dependsOnId) return 0
  return left.dependsOnId < right.dependsOnId ? -1 : 1
}

function once(edges: readonly IgnoredEdge[]): readonly IgnoredEdge[] {
  return [...edges]
    .sort(byEdge)
    .filter((edge, index, all) => index === 0 || byEdge(edge, all[index - 1] ?? edge) !== 0)
}

/** Where every schedulable feature landed, and the dependencies that had to be dropped. */
export interface Relaxation {
  readonly spans: ReadonlyMap<string, Span>
  readonly ignoredEdges: readonly IgnoredEdge[]
}

/**
 * Relaxes every schedulable feature in topological order, and names what it could not honour.
 *
 * A feature waits on the nearest earlier schedulable feature of its rail and on every `dependsOn`
 * that is schedulable too; it is placed once all of those are, at the greatest of 0, its
 * predecessors' ends and `pinSprint * sprintLengthDays`. The sweep repeats until nothing more is
 * ready, which is a topological order arrived at without building one.
 *
 * Rail edges and dependency edges can close a cycle together even though the `dependsOn` graph
 * alone is acyclic — a feature depending on one later on its own rail is the smallest case — and
 * no arrangement satisfies such a plan. The sweep then stalls, and this releases the stalled
 * feature **earliest in derived order**, placing it on what has already landed. That feature is by
 * definition the first unplaced one, so everything it still waits on comes later in the derived
 * order: a rail predecessor is never dropped, and every dependency that runs forward through the
 * plan is always honoured. What is dropped is named in `ignoredEdges`, deduplicated and sorted,
 * because a pass that silently ignored a stated dependency would be a solver quietly rewriting an
 * executive's plan.
 *
 * `estimates` decides who is schedulable: a feature absent from it is not placed and is not a
 * predecessor of anything, so an unestimated or in-cycle feature never cuts a rail in two.
 */
export function relax(
  rails: readonly (readonly ScheduleFeature[])[],
  estimates: ReadonlyMap<string, number>,
  sprintLengthDays: number,
): Relaxation {
  const ordered = nodesOf(rails, estimates)
  const nodes = new Map(ordered.map((node) => [node.feature.id, node]))
  const ignored: IgnoredEdge[] = []
  let unplaced = ordered.length
  while (unplaced > 0) {
    const before = unplaced
    for (const node of ordered) {
      if (node.placed || !ready(node, nodes)) continue
      place(node, nodes, sprintLengthDays)
      unplaced -= 1
    }
    if (unplaced !== before) continue
    ignored.push(...released(ordered, nodes, sprintLengthDays))
    unplaced -= 1
  }
  const spans = ordered.map((node): [string, Span] => [
    node.feature.id,
    { startDay: node.startDay, endDay: node.endDay },
  ])
  return { spans: new Map(spans), ignoredEdges: once(ignored) }
}
