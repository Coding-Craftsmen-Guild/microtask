import { describe, expect, it } from 'vitest'
import type { Cycle, ScheduleFeature } from './structure.js'
import { findCycles } from './cycles.js'
import { arbitraryPlan, randomSource } from './testing/arbitrary.js'

const SEEDS = 1000

const seeds = Array.from({ length: SEEDS }, (unused, index) => index)

const plans = seeds.map((seed) => arbitraryPlan(seed))

const results = plans.map((plan) => findCycles(plan.features))

const at = (seed: number): string => `seed ${String(seed)}`

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

function byFirstId(left: readonly string[], right: readonly string[]): number {
  const [firstLeft = ''] = left
  const [firstRight = ''] = right
  if (firstLeft === firstRight) return 0
  return firstLeft < firstRight ? -1 : 1
}

function canonical(cycles: readonly Cycle[]): readonly (readonly string[])[] {
  return cycles.map((cycle) => [...cycle.featureIds].sort()).sort(byFirstId)
}

function edgesOf(features: readonly ScheduleFeature[]): ReadonlyMap<string, readonly string[]> {
  const known = new Set(features.map((feature) => feature.id))
  return new Map(
    features.map((feature) => [feature.id, feature.dependsOn.filter((id) => known.has(id))]),
  )
}

describe('findCycles is invariant under a permutation of the feature array', () => {
  it('finds the same cycles, canonically compared, for a shuffled input', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      if (plan === undefined) continue
      const draw = randomSource(seed + SEEDS)
      const mixed = shuffled(plan.features, draw)
      expect(canonical(findCycles(mixed)), at(seed)).toEqual(canonical(results[seed] ?? []))
    }
  })
})

describe('every reported cycle is sound', () => {
  it('gives each member of a cycle of size > 1 an edge to another member of the same cycle', () => {
    for (const seed of seeds) {
      const plan = plans[seed]
      if (plan === undefined) continue
      const edges = edgesOf(plan.features)
      const cycles = (results[seed] ?? []).filter((cycle) => cycle.featureIds.length > 1)
      for (const cycle of cycles) {
        const members = new Set(cycle.featureIds)
        const unsound = cycle.featureIds.filter(
          (id) => !(edges.get(id) ?? []).some((to) => to !== id && members.has(to)),
        )
        expect(unsound, `${at(seed)}: cycle ${cycle.featureIds.join(',')}`).toEqual([])
      }
    }
  })

  it('finds at least one cycle of size > 1 across the seed range, so the check is not vacuous', () => {
    const withCycles = results.filter((cycles) => cycles.some((cycle) => cycle.featureIds.length > 1))
    expect(withCycles.length).toBeGreaterThan(0)
  })
})
