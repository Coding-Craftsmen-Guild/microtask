import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, PLAN_GONE } from '../testing/plan-fixture'
import { subjectValues } from './values'

const plan = () => planScreenModel(atlasPlan())

describe('reading one subject’s stored values back out of a plan', () => {
  it('reads a feature’s name and its authored estimate, which is the pair a field edits', () => {
    expect(subjectValues(plan(), 'feature', FEATURE_1)).toEqual({
      name: 'Auth rewrite',
      estimateDays: 5,
    })
  })

  it('reads an item’s from the items array, the two kinds not answering for each other', () => {
    expect(subjectValues(plan(), 'item', ITEM_1)).toEqual({ name: 'Sessions', estimateDays: 3 })
    expect(subjectValues(plan(), 'item', FEATURE_1)).toBeUndefined()
    expect(subjectValues(plan(), 'feature', ITEM_1)).toBeUndefined()
  })

  it('answers undefined for a subject the plan no longer holds, rather than an empty pair', () => {
    expect(subjectValues(plan(), 'feature', PLAN_GONE)).toBeUndefined()
  })

  // The authored value and nothing derived from it: `unplacedPlan` clears FEATURE_2's own estimate
  // while its one item still carries 3, so a function reading `effectiveEstimate` would answer 3 here.
  // A field that showed 3 would write the breakdown back onto the feature the moment it was blurred.
  it('reads the authored estimate and never what the breakdown came to', () => {
    const cleared = atlasPlan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_2 ? { ...one, estimateDays: null } : one,
      ),
    })
    expect(subjectValues(planScreenModel(cleared), 'feature', FEATURE_2)?.estimateDays).toBeNull()
  })

  it('answers the same values for the plan an action returns as for the model a page holds', () => {
    expect(subjectValues(atlasPlan(), 'feature', FEATURE_1)).toEqual(
      subjectValues(plan(), 'feature', FEATURE_1),
    )
  })
})

