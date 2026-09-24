import { breakdown, effectiveEstimate } from '@repo/schedule'
import type { ScheduleFeature, ScheduleItem } from '@repo/schedule'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { tableRows } from '../table/rows'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1 } from '../testing/plan-fixture'
import { BreakdownLine } from './breakdown-line'

afterEach(cleanup)

const feature = (estimateDays: number | null): ScheduleFeature => ({
  id: FEATURE_1,
  epicId: 'epic',
  position: 0,
  estimateDays,
  pinSprint: null,
  dependsOn: [],
})

const item = (estimateDays: number | null, id = 'i1'): ScheduleItem => ({
  id,
  featureId: FEATURE_1,
  position: 0,
  estimateDays,
})

const pairOf = (estimateDays: number | null, items: readonly ScheduleItem[]) =>
  breakdown(feature(estimateDays), items)

const line = (): string | null => document.querySelector('[data-slot="drawer-breakdown"]')?.textContent ?? null

const show = (estimateDays: number | null, items: readonly ScheduleItem[]) => {
  render(<BreakdownLine breakdown={pairOf(estimateDays, items)} />)
}

describe('what this line says, and what it deliberately leaves to the row', () => {
  it('says the timeline placed the feature by its items, and that its own estimate is kept', () => {
    show(40, [item(62)])
    expect(line()).toContain('places this feature by its items')
    expect(line()).toContain('kept rather than overwritten')
  })

  // The claim that keeps this from being a second wording of §3.2: the numbers belong to the row's own
  // Estimate cell, which `rows.ts` builds, and this line repeats none of them.
  it('prints no number at all, the pair’s own numbers being the row’s to word', () => {
    show(40, [item(62)])
    expect(line()).not.toMatch(/[0-9]/)
    expect(line()).not.toContain('planned')
    expect(line()).not.toContain('broken down to')
  })

  it('renders the same sentence for a shortfall as for an overrun, the sign never being read', () => {
    show(40, [item(62)])
    const overrun = line()
    cleanup()
    show(40, [item(5)])
    expect(line()).toBe(overrun)
  })

  it('renders it for a breakdown that agrees exactly, which is the case the row collapses', () => {
    show(40, [item(40)])
    expect(line()).toContain('places this feature by its items')
  })

  it('renders it for an authored 0 against a breakdown of 5, both halves being compared to null', () => {
    show(0, [item(5)])
    expect(line()).toBeTruthy()
  })

  it('renders it for a breakdown that comes to 0, three milestones being a real answer', () => {
    show(40, [item(0, 'a'), item(0, 'b')])
    expect(line()).toBeTruthy()
  })
})

describe('the states with no pair to report, where it draws nothing', () => {
  it('draws nothing when the feature carries no authored estimate', () => {
    show(null, [item(3)])
    expect(line()).toBeNull()
    expect(document.body.textContent).toBe('')
  })

  it('draws nothing when the feature has items and not one of them is estimated', () => {
    show(40, [item(null, 'a'), item(null, 'b')])
    expect(line()).toBeNull()
  })

  it('draws nothing when the feature has no items at all', () => {
    show(40, [])
    expect(line()).toBeNull()
  })

  it('draws nothing for a null handed straight in, which is what an item always resolves to', () => {
    render(<BreakdownLine breakdown={null} />)
    expect(document.body.textContent).toBe('')
  })
})

// The two functions ADR 0051 is about, checked against each other rather than trusted: the gate on
// `effectiveEstimate` is *at least one estimated item*, so these are the exact states in which a
// feature estimate is inert — and the states this line claims the feature was placed by its items.
describe('the line’s condition against the function that really places the bar', () => {
  it('appears only where effectiveEstimate takes the items rather than the authored value', () => {
    const cases: readonly (readonly [number | null, readonly ScheduleItem[]])[] = [
      [40, [item(62)]],
      [40, [item(5)]],
      [0, [item(5)]],
      [40, [item(0)]],
    ]
    for (const [authored, items] of cases) {
      const pair = pairOf(authored, items)
      expect(pair).not.toBeNull()
      expect(effectiveEstimate(feature(authored), items)).toBe(pair?.brokenDown)
      expect(pair?.planned).toBe(authored)
    }
  })

  it('is absent exactly where an unestimated breakdown leaves the authored value standing', () => {
    const items = [item(null, 'a'), item(null, 'b')]
    expect(pairOf(40, items)).toBeNull()
    expect(effectiveEstimate(feature(40), items)).toBe(40)
  })
})

// The row this line sits under, built from the real fixture rather than described: Atlas's first
// feature is authored at 5 with items adding up to 5, so `estimateOf` prints one number and the pair
// is invisible in it. That is the state this component exists for.
describe('the row beside it, so “the row already words the gap” is checked and not assumed', () => {
  it('collapses an agreeing pair to one number, which is why this line is not a repeat of it', () => {
    const row = tableRows(planScreenModel(atlasPlan())).find((one) => one.id === FEATURE_1)
    expect(row?.estimate).toBe('5d')
    show(5, [item(3, 'a'), { ...item(2, 'b'), position: 1 }])
    expect(line()).toBeTruthy()
  })

  it('leaves the gap itself to the row, which states all three numbers when they disagree', () => {
    const authored = atlasPlan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, estimateDays: 40 } : one,
      ),
    })
    const row = tableRows(planScreenModel(authored)).find((one) => one.id === FEATURE_1)
    expect(row?.estimate).toBe('planned 40d · broken down to 5d · -35d')
    show(40, [item(3, 'a'), { ...item(2, 'b'), position: 1 }])
    expect(line()).not.toContain('40')
  })
})
