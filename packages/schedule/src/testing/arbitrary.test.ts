import { describe, expect, it } from 'vitest'
import { arbitraryPlan, randomSource } from './arbitrary.js'

const SEEDS = 200

const seeds = Array.from({ length: SEEDS }, (unused, index) => index)

describe('the generator is reproducible, which is what makes a failing seed worth printing', () => {
  it('produces deeply equal structures from the same seed, twice', () => {
    for (const seed of seeds) {
      expect(arbitraryPlan(seed), `seed ${String(seed)}`).toEqual(arbitraryPlan(seed))
    }
  })

  it('produces a different structure for a different seed', () => {
    for (const seed of seeds) {
      expect(arbitraryPlan(seed), `seed ${String(seed)}`).not.toEqual(arbitraryPlan(seed + 1))
    }
  })

  it('replays the same draws from the same seed, and different ones from another', () => {
    const first = randomSource(7)
    const again = randomSource(7)
    const other = randomSource(8)
    const twenty = Array.from({ length: 20 }, () => 0)
    expect(twenty.map(() => first(1000))).toEqual(twenty.map(() => again(1000)))
    expect(twenty.map(() => first(1000))).not.toEqual(twenty.map(() => other(1000)))
  })

  it('answers 0 for an empty bound rather than NaN, so a draw over nothing is still total', () => {
    const draw = randomSource(3)
    expect(draw(0)).toBe(0)
    expect(draw(-1)).toBe(0)
  })

  it('draws only inside the bound it was given', () => {
    const draw = randomSource(11)
    const drawn = Array.from({ length: 500 }, () => draw(7))
    expect(drawn.every((at) => at >= 0 && at < 7)).toBe(true)
    expect(new Set(drawn).size).toBe(7)
  })
})

describe('the generator draws the shapes the properties are about', () => {
  const plans = seeds.map((seed) => arbitraryPlan(seed))

  it('stays inside the ranges it documents', () => {
    for (const at of plans) {
      expect(at.epics.length).toBeGreaterThanOrEqual(1)
      expect(at.epics.length).toBeLessThanOrEqual(6)
      const estimates = at.features.flatMap((feature) => feature.estimateDays ?? [])
      expect(estimates.every((days) => days >= 0 && days <= 30)).toBe(true)
      const pins = at.features.flatMap((feature) => feature.pinSprint ?? [])
      expect(pins.every((sprint) => sprint >= 0 && sprint <= 8)).toBe(true)
    }
  })

  it('draws at most three dependency edges per feature', () => {
    const widest = plans.flatMap((at) => at.features.map((feature) => feature.dependsOn.length))
    expect(Math.max(...widest)).toBeLessThanOrEqual(3)
  })

  it('draws self-edges on its own, so a cycle of one is never a case someone remembered', () => {
    const selfEdges = plans.filter((at) =>
      at.features.some((feature) => feature.dependsOn.includes(feature.id)),
    )
    expect(selfEdges.length).toBeGreaterThan(0)
  })

  it('draws unestimated features and unestimated items too', () => {
    expect(plans.some((at) => at.features.some((f) => f.estimateDays === null))).toBe(true)
    expect(plans.some((at) => at.items.some((i) => i.estimateDays === null))).toBe(true)
  })

  it('mints unique ids within a plan, feature ids and item ids sharing one namespace', () => {
    for (const at of plans) {
      const ids = [...at.features.map((f) => f.id), ...at.items.map((i) => i.id)]
      expect(new Set(ids).size, `seed ${String(plans.indexOf(at))}`).toBe(ids.length)
    }
  })
})
