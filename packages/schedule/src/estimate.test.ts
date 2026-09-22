import { describe, expect, it } from 'vitest'
import type { ScheduleFeature, ScheduleItem } from './structure.js'
import { breakdown, effectiveEstimate } from './estimate.js'

const feature = (estimateDays: number | null): ScheduleFeature => ({
  id: 'f1',
  epicId: 'e1',
  position: 0,
  estimateDays,
  pinSprint: null,
  dependsOn: [],
})

const items = (...estimates: readonly (number | null)[]): readonly ScheduleItem[] =>
  estimates.map((estimateDays, position) => ({
    id: `i${String(position)}`,
    featureId: 'f1',
    position,
    estimateDays,
  }))

const frozen = (of: readonly ScheduleItem[]): readonly ScheduleItem[] =>
  Object.freeze(of.map((item) => Object.freeze(item)))

describe('effectiveEstimate is the sum of the estimated items, or the authored value', () => {
  it('answers the feature’s own estimate when it has no items at all', () => {
    expect(effectiveEstimate(feature(40), [])).toBe(40)
  })

  it('answers null when the feature has neither an estimate nor any items', () => {
    expect(effectiveEstimate(feature(null), [])).toBeNull()
  })

  it('sums the estimated items and ignores the authored value entirely', () => {
    expect(effectiveEstimate(feature(40), items(20, 20, 22))).toBe(62)
  })

  it('falls back to the authored 40 when items exist but not one of them is estimated', () => {
    expect(effectiveEstimate(feature(40), items(null, null, null))).toBe(40)
  })

  it('answers null when items exist, none is estimated, and nothing was authored either', () => {
    expect(effectiveEstimate(feature(null), items(null, null))).toBeNull()
  })

  it('sums the one estimated item among three, rather than the authored 40', () => {
    expect(effectiveEstimate(feature(40), items(5, null, null))).toBe(5)
  })

  it('treats an authored 0 as a milestone estimate, never as unestimated', () => {
    const answer = effectiveEstimate(feature(0), [])
    expect(answer).toBe(0)
    expect(answer).not.toBeNull()
  })

  it('treats item estimates of 0 as estimates, so three milestones answer 0 and not 40', () => {
    expect(effectiveEstimate(feature(40), items(0, 0, 0))).toBe(0)
  })

  it('counts a 0 item among unestimated siblings as the breakdown, answering 0 not 40', () => {
    expect(effectiveEstimate(feature(40), items(null, 0, null))).toBe(0)
  })

  it('answers the same for the same feature twice, and mutates neither argument', () => {
    const one = feature(40)
    const three = frozen(items(20, 20, 22))
    const before = JSON.stringify([one, three])
    expect(effectiveEstimate(one, three)).toBe(62)
    expect(effectiveEstimate(one, three)).toBe(62)
    expect(JSON.stringify([one, three])).toBe(before)
    expect(one.estimateDays).toBe(40)
  })
})

describe('breakdown pairs an authored estimate with what the items came to', () => {
  it('reports the pair and a positive delta when the breakdown overruns the plan', () => {
    expect(breakdown(feature(40), items(20, 20, 22))).toEqual({
      planned: 40,
      brokenDown: 62,
      delta: 22,
    })
  })

  it('reports a negative delta when the breakdown falls short of the plan', () => {
    expect(breakdown(feature(40), items(35))).toEqual({ planned: 40, brokenDown: 35, delta: -5 })
  })

  it('counts only the estimated item when its three siblings carry no estimate', () => {
    expect(breakdown(feature(40), items(5, null, null))).toEqual({
      planned: 40,
      brokenDown: 5,
      delta: -35,
    })
  })

  it('answers null for a feature with an authored estimate and no items to compare it to', () => {
    expect(breakdown(feature(40), [])).toBeNull()
  })

  it('answers null when items exist but none of them is estimated', () => {
    expect(breakdown(feature(40), items(null, null, null))).toBeNull()
  })

  it('answers null for a breakdown with nothing authored beside it', () => {
    expect(breakdown(feature(null), items(20, 22))).toBeNull()
  })

  it('pairs an authored 0 against its breakdown rather than answering null', () => {
    expect(breakdown(feature(0), items(5))).toEqual({ planned: 0, brokenDown: 5, delta: 5 })
  })

  it('pairs a breakdown of 0 against the authored estimate rather than answering null', () => {
    expect(breakdown(feature(40), items(0, 0))).toEqual({
      planned: 40,
      brokenDown: 0,
      delta: -40,
    })
  })

  it('mutates neither argument, and answers the same pair when asked twice', () => {
    const one = feature(40)
    const three = frozen(items(20, 20, 22))
    const before = JSON.stringify([one, three])
    const first = breakdown(one, three)
    expect(breakdown(one, three)).toEqual(first)
    expect(JSON.stringify([one, three])).toBe(before)
  })
})
