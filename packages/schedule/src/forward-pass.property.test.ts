import { describe, expect, it } from 'vitest'
import type {
  IgnoredEdge,
  PlanStructure,
  ScheduleFeature,
  ScheduleItem,
  ScheduleResult,
  Span,
} from './structure.js'
import { effectiveEstimate } from './estimate.js'
import { schedule } from './forward-pass.js'
import { arbitraryPlan, randomSource } from './testing/arbitrary.js'

const SEEDS = 1000

const seeds = Array.from({ length: SEEDS }, (unused, index) => index)

const plans = seeds.map((seed) => arbitraryPlan(seed))

const results = plans.map((plan) => schedule(plan))

const at = (seed: number): string => `seed ${String(seed)}`

const pad = (of: number): string => String(of + 1_000_000).padStart(9, '0')

function derivedOrder(plan: PlanStructure): ReadonlyMap<string, number> {
  const rails = new Map(plan.epics.map((epic) => [epic.id, epic.railOrder]))
  const key = (feature: ScheduleFeature): string =>
    [
      pad(rails.get(feature.epicId) ?? Number.MAX_SAFE_INTEGER),
      feature.epicId,
      pad(feature.position),
      feature.id,
    ].join('|')
  const line = [...plan.features].sort((left, right) => (key(left) < key(right) ? -1 : 1))
  return new Map(line.map((feature, index) => [feature.id, index]))
}

function itemsByFeature(plan: PlanStructure): ReadonlyMap<string, readonly ScheduleItem[]> {
  const grouped = new Map<string, ScheduleItem[]>()
  for (const item of plan.items) {
    const under = grouped.get(item.featureId) ?? []
    under.push(item)
    grouped.set(item.featureId, under)
  }
  for (const under of grouped.values()) {
    under.sort((left, right) => left.position - right.position || (left.id < right.id ? -1 : 1))
  }
  return grouped
}

function shuffled<T>(of: readonly T[], draw: (bound: number) => number): readonly T[] {
  const copy = [...of]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = draw(index + 1)
    const here = copy[index]
    const there = copy[swap]
    if (here !== undefined && there !== undefined) {
      copy[index] = there
      copy[swap] = here
    }
  }
  return copy
}

function shuffledPlan(plan: PlanStructure, seed: number): PlanStructure {
  const draw = randomSource(seed + SEEDS)
  return {
    ...plan,
    epics: shuffled(plan.epics, draw),
    features: shuffled(plan.features, draw),
    items: shuffled(plan.items, draw),
  }
}

function forwardOnly(plan: PlanStructure): PlanStructure {
  const order = derivedOrder(plan)
  const before = (from: string, to: string): boolean =>
    (order.get(to) ?? -1) < (order.get(from) ?? -1)
  return {
    ...plan,
    features: plan.features.map((feature) => ({
      ...feature,
      dependsOn: feature.dependsOn.filter((id) => before(feature.id, id)),
    })),
  }
}

function withOneMoreEdge(plan: PlanStructure, seed: number): PlanStructure {
  const order = derivedOrder(plan)
  const line = [...plan.features].sort(
    (left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0),
  )
  const draw = randomSource(seed + 2 * SEEDS)
  const low = line[draw(line.length)]
  const high = line[draw(line.length)]
  if (low === undefined || high === undefined || low.id === high.id) return plan
  const [earlier, later] = (order.get(low.id) ?? 0) < (order.get(high.id) ?? 0) ? [low, high] : [high, low]
  return {
    ...plan,
    features: plan.features.map((feature) =>
      feature.id === later.id
        ? { ...feature, dependsOn: [...feature.dependsOn, earlier.id] }
        : feature,
    ),
  }
}

function railsOf(plan: PlanStructure): readonly (readonly ScheduleFeature[])[] {
  const order = derivedOrder(plan)
  const grouped = new Map<string, ScheduleFeature[]>()
  for (const feature of plan.features) {
    const rail = grouped.get(feature.epicId) ?? []
    rail.push(feature)
    grouped.set(feature.epicId, rail)
  }
  return [...grouped.values()].map((rail) =>
    [...rail].sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0)),
  )
}

const spanOf = (days: ReadonlyMap<string, Span>, id: string): Span | undefined => days.get(id)

describe('totality: the pass places what it can and describes the rest, for every plan', () => {
  it('never throws, over a thousand seeded plans', () => {
    for (const seed of seeds) {
      expect(() => schedule(plans[seed] ?? arbitraryPlan(seed)), at(seed)).not.toThrow()
    }
  })

  it('answers cycles exactly as findCycles saw them, in ascending order of first id', () => {
    for (const seed of seeds) {
      const cycles = results[seed]?.cycles ?? []
      const firsts = cycles.map((cycle) => cycle.featureIds[0] ?? '')
      expect([...firsts].sort(), at(seed)).toEqual(firsts)
    }
  })
})

describe('partition: every feature and every item is placed or explained, never both', () => {
  it('finds each id in days or in unscheduled, and in exactly one of them', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const unscheduled = new Set(result.unscheduled.map((one) => one.id))
      const ids = [...plan.features.map((f) => f.id), ...plan.items.map((i) => i.id)]
      const missing = ids.filter((id) => !result.days.has(id) && !unscheduled.has(id))
      const doubled = ids.filter((id) => result.days.has(id) && unscheduled.has(id))
      expect(missing, `${at(seed)}: neither placed nor explained`).toEqual([])
      expect(doubled, `${at(seed)}: both placed and explained`).toEqual([])
    }
  })

  it('sorts unscheduled by id, with no id named twice and none invented', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const ids = result.unscheduled.map((one) => one.id)
      const known = new Set([...plan.features.map((f) => f.id), ...plan.items.map((i) => i.id)])
      expect([...ids].sort(), at(seed)).toEqual(ids)
      expect(new Set(ids).size, at(seed)).toBe(ids.length)
      expect(ids.filter((id) => !known.has(id)), at(seed)).toEqual([])
    }
  })
})

describe('order independence: the answer comes from the plan, never from array order', () => {
  it('shuffles the arrays into a real permutation, not a reversal', () => {
    const draw = randomSource(99)
    const line = Array.from({ length: 12 }, (unused, index) => index)
    const mixed = shuffled(line, draw)
    expect([...mixed].sort((l, r) => l - r)).toEqual(line)
    expect(mixed).not.toEqual(line)
    expect(mixed).not.toEqual([...line].reverse())
  })

  it('answers the same days, cycles and unscheduled after shuffling every array', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const other = schedule(shuffledPlan(plan, seed))
      expect(other.days, at(seed)).toEqual(result.days)
      expect(other.cycles, at(seed)).toEqual(result.cycles)
      expect(other.unscheduled, at(seed)).toEqual(result.unscheduled)
    }
  })
})

describe('monotonicity: one more edge can only ever delay', () => {
  it('moves nothing earlier when an edge is added to a plan that agrees with its own order', () => {
    for (const seed of seeds) {
      const plan = forwardOnly(plans[seed] ?? arbitraryPlan(seed))
      const before = schedule(plan)
      const after = schedule(withOneMoreEdge(plan, seed))
      expect(after.days.size, `${at(seed)}: an added edge unscheduled something`).toBe(
        before.days.size,
      )
      const earlier = [...before.days.entries()].filter(
        ([id, span]) => (spanOf(after.days, id)?.startDay ?? span.startDay) < span.startDay,
      )
      expect(earlier.map(([id]) => id), `${at(seed)}: moved earlier`).toEqual([])
    }
  })
})

describe('pins hold: a pinned feature never starts before the sprint it is pinned to', () => {
  it('starts every scheduled pinned feature at or after its sprint boundary', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      for (const feature of plan.features) {
        const span = spanOf(result.days, feature.id)
        if (span === undefined || feature.pinSprint === null) continue
        const floor = feature.pinSprint * plan.sprintLengthDays
        expect(span.startDay, `${at(seed)}: ${feature.id} pinned to ${String(feature.pinSprint)}`)
          .toBeGreaterThanOrEqual(floor)
      }
    }
  })
})

describe('cycles are contained: they take their own features off the axis and nothing else', () => {
  it('leaves every feature named in a cycle unscheduled as in-cycle, with all of its items', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const reasons = new Map(result.unscheduled.map((one) => [one.id, one.reason]))
      const items = itemsByFeature(plan)
      for (const id of result.cycles.flatMap((cycle) => [...cycle.featureIds])) {
        expect(reasons.get(id), `${at(seed)}: ${id}`).toBe('in-cycle')
        const under = (items.get(id) ?? []).map((item) => reasons.get(item.id))
        expect(under.every((reason) => reason === 'in-cycle'), `${at(seed)}: items of ${id}`).toBe(
          true,
        )
      }
    }
  })

  it('places every other feature that has an effective estimate, cycle or no cycle', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const caught = new Set(result.cycles.flatMap((cycle) => [...cycle.featureIds]))
      const items = itemsByFeature(plan)
      const missing = plan.features.filter(
        (feature) =>
          !caught.has(feature.id) &&
          effectiveEstimate(feature, items.get(feature.id) ?? []) !== null &&
          !result.days.has(feature.id),
      )
      expect(missing.map((feature) => feature.id), at(seed)).toEqual([])
    }
  })
})

describe('contiguity: a feature is exactly its items, laid end to end with no gap', () => {
  it('spans the sum of its estimated items, which tile its span exactly', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const items = itemsByFeature(plan)
      for (const feature of plan.features) {
        const span = spanOf(result.days, feature.id)
        if (span === undefined) continue
        const under = (items.get(feature.id) ?? []).flatMap(
          (item) => spanOf(result.days, item.id) ?? [],
        )
        const estimates = (items.get(feature.id) ?? []).flatMap((item) => item.estimateDays ?? [])
        const width = estimates.length === 0 ? (feature.estimateDays ?? 0) : sum(estimates)
        expect(span.endDay - span.startDay, `${at(seed)}: ${feature.id} width`).toBe(width)
        expect(tiles(span, under), `${at(seed)}: ${feature.id} items do not tile its span`).toBe(
          true,
        )
      }
    }
  })
})

function sum(of: readonly number[]): number {
  return of.reduce((running, one) => running + one, 0)
}

function tiles(span: Span, under: readonly Span[]): boolean {
  if (under.length === 0) return true
  let cursor = span.startDay
  for (const one of under) {
    if (one.startDay !== cursor) return false
    cursor = one.endDay
  }
  return cursor === span.endDay
}

function broken(plan: PlanStructure, result: ScheduleResult): readonly string[] {
  const dropped = new Set(
    result.ignoredEdges.map((edge) => `${edge.featureId}<-${edge.dependsOnId}`),
  )
  return plan.features.flatMap((feature) => {
    const span = spanOf(result.days, feature.id)
    if (span === undefined) return []
    return feature.dependsOn
      .filter((id) => !dropped.has(`${feature.id}<-${id}`))
      .filter((id) => {
        const waited = spanOf(result.days, id)
        return waited !== undefined && span.startDay < waited.endDay
      })
      .map((id) => `${feature.id}<-${id}`)
  })
}

describe('dependencies hold: a feature starts no earlier than what it waits on has ended', () => {
  const violations = (seed: number): readonly string[] => {
    const plan = plans[seed]
    const result = results[seed]
    if (plan === undefined || result === undefined) return []
    return broken(plan, result)
  }

  it('honours every edge it did not report as dropped, over a thousand seeds', () => {
    for (const seed of seeds) {
      expect(violations(seed), `${at(seed)}: an edge was broken without being named`).toEqual([])
    }
  })

  it('drops nothing at all from a plan that no longer contradicts its own order', () => {
    for (const seed of seeds) {
      const plan = forwardOnly(plans[seed] ?? arbitraryPlan(seed))
      const result = schedule(plan)
      expect(result.ignoredEdges, at(seed)).toEqual([])
      expect(broken(plan, result), at(seed)).toEqual([])
    }
  })
})

describe('an ignored edge names a real contradiction, and only ever a backward one', () => {
  it('names a feature that is on the axis, and an edge that feature really declares', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const declared = new Map(plan.features.map((feature) => [feature.id, feature.dependsOn]))
      const invented = result.ignoredEdges.filter(
        (edge) =>
          !result.days.has(edge.featureId) ||
          !result.days.has(edge.dependsOnId) ||
          !(declared.get(edge.featureId) ?? []).includes(edge.dependsOnId),
      )
      expect(invented, `${at(seed)}: an ignored edge nobody declared`).toEqual([])
    }
  })

  it('sorts them by feature then by dependency, naming each dropped edge once', () => {
    const before = (left: IgnoredEdge, right: IgnoredEdge): number => {
      if (left.featureId !== right.featureId) return left.featureId < right.featureId ? -1 : 1
      return left.dependsOnId < right.dependsOnId ? -1 : 1
    }
    for (const seed of seeds) {
      const edges = results[seed]?.ignoredEdges ?? []
      expect([...edges].sort(before), at(seed)).toEqual(edges)
      const named = edges.map((edge) => JSON.stringify([edge.featureId, edge.dependsOnId]))
      expect(new Set(named).size, at(seed)).toBe(edges.length)
    }
  })

  it('drops only edges pointing backwards through the plan, never a rail predecessor', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      const order = derivedOrder(plan)
      const forward = result.ignoredEdges.filter(
        (edge) => (order.get(edge.dependsOnId) ?? 0) < (order.get(edge.featureId) ?? 0),
      )
      expect(forward, `${at(seed)}: a forward edge was dropped`).toEqual([])
    }
  })

  it('finds at least one deadlock across the seed range, so the report is not vacuous', () => {
    const withDrops = seeds.filter((seed) => (results[seed]?.ignoredEdges.length ?? 0) > 0)
    expect(withDrops.length).toBeGreaterThan(100)
  })
})

describe('rail order holds: a rail never runs backwards', () => {
  it('starts each scheduled feature no earlier than the one before it on its rail', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      const result = results[seed]
      if (plan === undefined || result === undefined) continue
      for (const rail of railsOf(plan)) {
        const starts = rail.flatMap((feature) => spanOf(result.days, feature.id)?.startDay ?? [])
        const sorted = [...starts].sort((left, right) => left - right)
        expect(starts, `${at(seed)}: a rail runs backwards`).toEqual(sorted)
      }
    }
  })
})
