import { describe, expect, it } from 'vitest'
import type { ScheduleFeature } from './structure.js'
import { relax } from './relax.js'

const feature = (id: string, position: number, dependsOn: readonly string[] = []): ScheduleFeature => ({
  id,
  epicId: 'unused',
  position,
  estimateDays: 1,
  pinSprint: null,
  dependsOn,
})

const rail = (prefix: string): readonly ScheduleFeature[] => [
  feature(`${prefix}1`, 0, [`${prefix}2`]),
  feature(`${prefix}2`, 1),
]

const estimatesFor = (rails: readonly (readonly ScheduleFeature[])[]): ReadonlyMap<string, number> =>
  new Map(rails.flat().map((one) => [one.id, 1]))

describe('relax resolves more than one stall in a single call', () => {
  const rails = [rail('fA'), rail('fB'), rail('fC')]
  const estimates = estimatesFor(rails)
  const result = relax(rails, estimates, 10)

  it('places the first feature of every rail on day 0, forced off its own dependency', () => {
    expect(result.spans.get('fA1')).toEqual({ startDay: 0, endDay: 1 })
    expect(result.spans.get('fB1')).toEqual({ startDay: 0, endDay: 1 })
    expect(result.spans.get('fC1')).toEqual({ startDay: 0, endDay: 1 })
  })

  it('places the second feature of every rail right after the first, once freed', () => {
    expect(result.spans.get('fA2')).toEqual({ startDay: 1, endDay: 2 })
    expect(result.spans.get('fB2')).toEqual({ startDay: 1, endDay: 2 })
    expect(result.spans.get('fC2')).toEqual({ startDay: 1, endDay: 2 })
  })

  it('names exactly the three edges the stall releases dropped, one per rail', () => {
    expect(result.ignoredEdges).toEqual([
      { featureId: 'fA1', dependsOnId: 'fA2' },
      { featureId: 'fB1', dependsOnId: 'fB2' },
      { featureId: 'fC1', dependsOnId: 'fC2' },
    ])
  })
})

describe('relax needs no stall release at all when rail order and dependencies agree', () => {
  it('places a plain chain without dropping anything', () => {
    const rails = [[feature('g1', 0), feature('g2', 1)]]
    const estimates = new Map([
      ['g1', 2],
      ['g2', 3],
    ])
    const result = relax(rails, estimates, 10)
    expect(result.spans.get('g1')).toEqual({ startDay: 0, endDay: 2 })
    expect(result.spans.get('g2')).toEqual({ startDay: 2, endDay: 5 })
    expect(result.ignoredEdges).toEqual([])
  })
})
