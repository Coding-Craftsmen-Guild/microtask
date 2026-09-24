import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, ITEM_3, PLAN_GONE } from '../testing/plan-fixture'
import { drawerSubject } from './subject'

const plan = (overrides: Parameters<typeof atlasPlan>[0] = {}) =>
  planScreenModel(atlasPlan(overrides))

describe('resolving the one subject a drawer is open on', () => {
  it('answers the row the table worded and the values a field edits, for one feature', () => {
    const subject = drawerSubject(plan(), 'feature', FEATURE_1)
    expect(subject?.row.feature).toBe('Auth rewrite')
    expect(subject?.row.estimate).toBe('5d')
    expect(subject?.values).toEqual({
      name: 'Auth rewrite',
      estimateDays: 5,
      pinSprint: null,
      calendar: { startDate: '2026-09-28', sprintLengthDays: 14, timezone: 'Europe/Belgrade' },
      breakdown: { planned: 5, brokenDown: 5, delta: 0 },
    })
  })

  it('answers both halves about the same record, which is what one lookup buys', () => {
    const subject = drawerSubject(plan(), 'item', ITEM_1)
    expect(subject?.row.id).toBe(ITEM_1)
    expect(subject?.row.item).toBe('Sessions')
    expect(subject?.values.name).toBe('Sessions')
  })

  // The two halves are two readings and not two copies. FEATURE_1 authored at 40 with items adding up
  // to 5 makes them visibly different: the row says what the schedule made of the estimate, and the
  // field holds what was authored. A panel that parsed the row's sentence would send 40, 5 or neither.
  it('keeps the schedule’s sentence and the authored number apart where they disagree', () => {
    const authored = plan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, estimateDays: 40 } : one,
      ),
    })
    const subject = drawerSubject(authored, 'feature', FEATURE_1)
    expect(subject?.row.estimate).toBe('planned 40d · broken down to 5d · -35d')
    expect(subject?.values.estimateDays).toBe(40)
  })

  it('answers nothing for an id of the other kind, so neither segment covers for the other', () => {
    expect(drawerSubject(plan(), 'feature', ITEM_1)).toBeUndefined()
    expect(drawerSubject(plan(), 'item', FEATURE_1)).toBeUndefined()
  })

  it('answers nothing for an id the plan does not hold at all', () => {
    expect(drawerSubject(plan(), 'feature', PLAN_GONE)).toBeUndefined()
  })

  // The one absence narrower than "the plan holds this id", and the reason the row is the check: the
  // item is still in `plan.items`, so reading values alone would have found it and drawn a panel with
  // no rail, no feature and no sprint in it.
  it('answers nothing for an item whose feature the plan no longer holds, though the item is in it', () => {
    const orphaned = plan({ features: [] })
    expect(orphaned.items.some((one) => one.id === ITEM_3)).toBe(true)
    expect(drawerSubject(orphaned, 'item', ITEM_3)).toBeUndefined()
  })

  it('names the rail the canvas draws for a feature no epic claims, rather than refusing it', () => {
    expect(drawerSubject(plan({ epics: [] }), 'feature', FEATURE_2)?.row.epic).toBe('Unclaimed rail')
  })
})

// The two members the panel needs and neither the row nor the record carries, added inside the one
// lookup rather than fetched beside it. Each is checked against `@repo/schedule`'s own answer rather
// than against a number written here, because the whole point is that nothing in this app recomputes it.
describe('the breakdown this lookup carries, and the states it has no pair for', () => {
  const authored = (estimateDays: number | null) =>
    plan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, estimateDays } : one,
      ),
    })

  it('answers the pair breakdown() answers for a feature authored against estimated items', () => {
    const subject = drawerSubject(authored(40), 'feature', FEATURE_1)
    expect(subject?.values.breakdown).toEqual({ planned: 40, brokenDown: 5, delta: -35 })
  })

  it('keeps a negative delta rather than forcing it to zero, a shortfall being a real state', () => {
    expect(drawerSubject(authored(40), 'feature', FEATURE_1)?.values.breakdown?.delta).toBe(-35)
    expect(drawerSubject(authored(1), 'feature', FEATURE_1)?.values.breakdown?.delta).toBe(4)
  })

  it('answers a pair for an agreeing breakdown, which the row’s own wording collapses to one number', () => {
    const subject = drawerSubject(plan(), 'feature', FEATURE_1)
    expect(subject?.values.breakdown).toEqual({ planned: 5, brokenDown: 5, delta: 0 })
    expect(subject?.row.estimate).toBe('5d')
  })

  it('answers null where the feature carries no authored estimate to pair with', () => {
    expect(drawerSubject(authored(null), 'feature', FEATURE_1)?.values.breakdown).toBeNull()
  })

  it('answers null where the feature has items and not one of them is estimated', () => {
    const unsized = plan({
      items: atlasPlan().items.map((one) => ({ ...one, estimateDays: null })),
    })
    expect(drawerSubject(unsized, 'feature', FEATURE_1)?.values.breakdown).toBeNull()
  })

  it('answers null where the feature has no items at all, there being nothing to compare', () => {
    expect(drawerSubject(plan({ items: [] }), 'feature', FEATURE_1)?.values.breakdown).toBeNull()
  })

  it('answers null for every item, an item having no items of its own', () => {
    expect(drawerSubject(plan(), 'item', ITEM_1)?.values.breakdown).toBeNull()
  })

  // The filter is by `featureId`, so a sibling feature's items may not reach this pair: FEATURE_2's
  // one item is 3 days, and counting it would make FEATURE_1's breakdown 8.
  it('counts this feature’s own items and not the plan’s, which is what the filter is for', () => {
    expect(drawerSubject(plan(), 'feature', FEATURE_1)?.values.breakdown?.brokenDown).toBe(5)
    expect(drawerSubject(plan(), 'feature', FEATURE_2)?.values.breakdown?.brokenDown).toBe(3)
  })
})

describe('the calendar it carries, which is the plan’s three scheduling fields and nothing else', () => {
  it('answers the plan’s own start date, sprint length and zone', () => {
    const at = atlasPlan()
    expect(drawerSubject(plan(), 'feature', FEATURE_1)?.values.calendar).toEqual({
      startDate: at.startDate,
      sprintLengthDays: at.sprintLengthDays,
      timezone: at.timezone,
    })
  })

  it('carries exactly three fields, so nothing plan-shaped rides along inside it', () => {
    const calendar = drawerSubject(plan(), 'item', ITEM_1)?.values.calendar
    expect(Object.keys(calendar ?? {}).sort()).toEqual([
      'sprintLengthDays',
      'startDate',
      'timezone',
    ])
  })

  it('answers it for an item too, a sprint meaning the same dates whichever subject is open', () => {
    expect(drawerSubject(plan(), 'item', ITEM_1)?.values.calendar.sprintLengthDays).toBe(14)
  })
})
