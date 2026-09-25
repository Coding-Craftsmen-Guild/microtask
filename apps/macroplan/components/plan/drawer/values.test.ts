import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, PLAN_GONE } from '../testing/plan-fixture'
import { subjectValues, waitsOn } from './values'

const plan = () => planScreenModel(atlasPlan())

const pinnedPlan = (pinSprint: number | null) =>
  planScreenModel(
    atlasPlan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, pinSprint } : one,
      ),
    }),
  )

describe('reading one subject’s stored values back out of a plan', () => {
  it('reads a feature’s name, its authored estimate and its pin, which is what a field edits', () => {
    expect(subjectValues(plan(), 'feature', FEATURE_1)).toEqual({
      name: 'Auth rewrite',
      estimateDays: 5,
      pinSprint: null,
    })
  })

  it('reads an item’s from the items array, the two kinds not answering for each other', () => {
    expect(subjectValues(plan(), 'item', ITEM_1)).toEqual({
      name: 'Sessions',
      estimateDays: 3,
      pinSprint: null,
    })
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

// `pinSprint` is `PlanFeature`'s and not `PlanItem`'s, so the `null` on an item is the **absence of the
// field** and not an unpinned item. It is answered from the branch being looked in rather than from an
// optional read, which is what stops the two records from sharing a spelling they do not share.
describe('the pin, which one of the two kinds has and the other does not', () => {
  it('reads a stored pin as the 0-based index the contract holds, sprint 1 being 0', () => {
    expect(subjectValues(pinnedPlan(0), 'feature', FEATURE_1)?.pinSprint).toBe(0)
    expect(subjectValues(pinnedPlan(4), 'feature', FEATURE_1)?.pinSprint).toBe(4)
  })

  it('tells 0 and null apart, a pin to the first sprint being a pin and not an absence', () => {
    expect(subjectValues(pinnedPlan(0), 'feature', FEATURE_1)?.pinSprint).not.toBeNull()
    expect(subjectValues(pinnedPlan(null), 'feature', FEATURE_1)?.pinSprint).toBeNull()
  })

  it('answers null for every item, the record having no such field to read', () => {
    for (const item of atlasPlan().items) {
      expect(subjectValues(plan(), 'item', item.id)?.pinSprint, item.id).toBeNull()
    }
    expect(Object.keys(atlasPlan().items[0] ?? {})).not.toContain('pinSprint')
  })

  it('keeps a feature’s pin out of an item’s values even where the plan holds one', () => {
    expect(subjectValues(pinnedPlan(4), 'item', ITEM_1)?.pinSprint).toBeNull()
  })
})

// The dependency control's half of "what is on screen is what the server stored": one edge of the
// plan a write answered with, asked about rather than assumed from the list that was sent.
describe('asking the answered plan whether one feature still waits on another', () => {
  it('answers true for an edge the plan really holds', () => {
    expect(waitsOn(plan(), FEATURE_2, FEATURE_1)).toBe(true)
  })

  it('answers false for the same pair the other way round, an edge having a direction', () => {
    expect(waitsOn(plan(), FEATURE_1, FEATURE_2)).toBe(false)
  })

  it('answers false for a feature the plan no longer holds rather than throwing', () => {
    expect(waitsOn(plan(), PLAN_GONE, FEATURE_1)).toBe(false)
  })

  it('answers false for a candidate id the list does not name', () => {
    expect(waitsOn(plan(), FEATURE_2, PLAN_GONE)).toBe(false)
  })
})
