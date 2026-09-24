import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { tableRows } from '../table/rows'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1 } from '../testing/plan-fixture'
import { BreakdownLine } from './breakdown-line'

afterEach(cleanup)

const line = (): string | null => document.querySelector('[data-slot="drawer-breakdown"]')?.textContent ?? null

const show = (sizedByItems: boolean) => {
  render(<BreakdownLine sizedByItems={sizedByItems} />)
}

const rowOf = (estimateDays: number | null) => {
  const plan = atlasPlan({
    features: atlasPlan().features.map((one) =>
      one.id === FEATURE_1 ? { ...one, estimateDays } : one,
    ),
  })
  return tableRows(planScreenModel(plan)).find((one) => one.id === FEATURE_1)
}

describe('what this line says, and what it deliberately leaves to the row', () => {
  it('says the timeline placed the feature by its items, and that its own estimate is kept', () => {
    show(true)
    expect(line()).toContain('places this feature by its items')
    expect(line()).toContain('kept rather than overwritten')
  })

  // The claim that keeps this from being a second wording of §3.2: the numbers belong to the row's own
  // Estimate cell, which `rows.ts` builds, and this line repeats none of them.
  it('prints no number at all, every number there is to print being the row’s to word', () => {
    show(true)
    expect(line()).not.toMatch(/[0-9]/)
    expect(line()).not.toContain('planned')
    expect(line()).not.toContain('broken down to')
  })

  it('draws nothing where the feature’s own estimate is the one that places it', () => {
    show(false)
    expect(line()).toBeNull()
    expect(document.body.textContent).toBe('')
  })
})

// The row this line sits under, built from the real fixture rather than described: Atlas's first
// feature has items of 3 and 2, so what its Estimate cell reads depends only on what was authored
// beside them. Each case below is a state in which this line is drawn, and none of the three leaves a
// number for it to add.
describe('the row beside it, so “the row already words the numbers” is checked and not assumed', () => {
  it('collapses an agreeing pair to one number, which is why this line is not a repeat of it', () => {
    expect(rowOf(5)?.estimate).toBe('5d')
    show(true)
    expect(line()).toContain('places this feature by its items')
  })

  it('leaves the gap itself to the row, which states all three numbers when they disagree', () => {
    expect(rowOf(40)?.estimate).toBe('planned 40d · broken down to 5d · -35d')
    show(true)
    expect(line()).not.toContain('40')
  })

  // The state an earlier wording of this component's note excused itself for being silent in, on the
  // ground that the cell reads `no estimate` there. It does not: `estimateOf` falls through to
  // `effectiveEstimate`, which takes the items, so the cell shows their sum while the estimate field
  // beside it is empty. That is the discrepancy this line is the only explanation of.
  it('prints the items’ own sum where nothing was authored, rather than “no estimate”', () => {
    expect(rowOf(null)?.estimate).toBe('5d')
    expect(rowOf(null)?.estimate).not.toBe('no estimate')
    show(true)
    expect(line()).toContain('changing it moves no bar')
  })
})
