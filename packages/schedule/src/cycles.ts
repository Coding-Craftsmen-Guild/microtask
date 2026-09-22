import type { Cycle, ScheduleFeature } from './structure.js'

const UNCONSTRAINED = Number.MAX_SAFE_INTEGER

interface Visited {
  readonly index: number
  low: number
}

interface Walk {
  readonly edges: ReadonlyMap<string, readonly string[]>
  readonly visited: Map<string, Visited>
  readonly stack: string[]
  readonly onStack: Set<string>
  readonly components: string[][]
  next: number
}

function edgesOf(features: readonly ScheduleFeature[]): ReadonlyMap<string, readonly string[]> {
  const known = new Set(features.map((feature) => feature.id))
  return new Map(
    features.map((feature) => [feature.id, feature.dependsOn.filter((id) => known.has(id))]),
  )
}

function popComponent(walk: Walk, root: string): string[] {
  const component: string[] = []
  for (let popped = walk.stack.pop(); popped !== undefined; popped = walk.stack.pop()) {
    walk.onStack.delete(popped)
    component.push(popped)
    if (popped === root) break
  }
  return component
}

function lowOfEdge(walk: Walk, to: string): number {
  const seen = walk.visited.get(to)
  if (seen === undefined) return visit(walk, to).low
  return walk.onStack.has(to) ? seen.index : UNCONSTRAINED
}

function visit(walk: Walk, id: string): Visited {
  const here: Visited = { index: walk.next, low: walk.next }
  walk.visited.set(id, here)
  walk.next += 1
  walk.stack.push(id)
  walk.onStack.add(id)
  for (const to of walk.edges.get(id) ?? []) {
    here.low = Math.min(here.low, lowOfEdge(walk, to))
  }
  if (here.low === here.index) walk.components.push(popComponent(walk, id))
  return here
}

function isCycle(
  edges: ReadonlyMap<string, readonly string[]>,
  component: readonly string[],
): boolean {
  const [only] = component
  if (component.length > 1) return true
  return only !== undefined && (edges.get(only) ?? []).includes(only)
}

function byFirstId(left: Cycle, right: Cycle): number {
  const [first = ''] = left.featureIds
  const [second = ''] = right.featureIds
  if (first < second) return -1
  return first > second ? 1 : 0
}

/**
 * Every dependency cycle among features, each as ascending ids, the whole list in ascending
 * order of first id. A self-edge is a cycle of one.
 *
 * Tarjan's strongly connected components, one depth-first walk over the `dependsOn` graph: a
 * component of more than one feature is a cycle, and a lone feature is one only when it carries
 * an edge to itself. Tarjan rather than "walk every path looking for a repeat" because a plan
 * may hold 200 features and 400 edges, and enumerating paths on a graph that dense is
 * exponential where this is linear in features plus edges. A self-edge sitting inside a larger
 * component adds nothing: the component already names it, and it is reported once.
 *
 * An edge naming a feature id that does not exist is dropped before the walk rather than
 * reported. `schedule` must be total — a dangling edge is a storage fault, not a plan the user
 * could see or fix, and answering with a cycle nobody can find in the timeline would be worse
 * than ignoring it.
 *
 * `visit` and `lowOfEdge` are mutually recursive — `visit` calls `lowOfEdge` for each edge, which
 * calls `visit` again for an unvisited target — so every step down the walk costs **two** JS
 * frames, and recursion depth is about twice the number of features rather than equal to it, though
 * still bounded by the features of one plan rather than by input size in general. That is safe only
 * because a plan is capped at 200 features — 400 frames is well under any stack limit — and that
 * bound is part of why the cap exists, not an incidental fact about it.
 *
 * Discovery order depends on the order features arrive in, so it is sorted out of the answer:
 * ids ascending within each cycle, cycles ascending by first id. Components are disjoint, so no
 * two cycles can share a first id and that ordering is total. Neither the caller's array nor any
 * feature in it is touched; every sort here runs on a copy.
 */
export function findCycles(features: readonly ScheduleFeature[]): readonly Cycle[] {
  const edges = edgesOf(features)
  const walk: Walk = {
    edges,
    visited: new Map(),
    stack: [],
    onStack: new Set(),
    components: [],
    next: 0,
  }
  for (const id of edges.keys()) {
    if (!walk.visited.has(id)) visit(walk, id)
  }
  return walk.components
    .filter((component) => isCycle(edges, component))
    .map((component) => ({ featureIds: [...component].sort() }))
    .sort(byFirstId)
}
