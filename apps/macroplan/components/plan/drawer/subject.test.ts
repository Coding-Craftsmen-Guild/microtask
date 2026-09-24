import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, ITEM_1, ITEM_3 } from '../testing/plan-fixture'
import { drawerSubject } from './subject'

const plan = (overrides: Parameters<typeof atlasPlan>[0] = {}) =>
  planScreenModel(atlasPlan(overrides))

describe('resolving the one subject a drawer is open on', () => {
  it('answers the row the table worded and the values a field edits, for one feature', () => {
    const subject = drawerSubject(plan(), 'feature', FEATURE_1)
    expect(subject?.row.feature).toBe('Auth rewrite')
    expect(subject?.row.estimate).toBe('5d')
    expect(subject?.values).toEqual({ name: 'Auth rewrite', estimateDays: 5 })
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
    expect(drawerSubject(plan(), 'feature', '01MPFFFFFFFFFFFFFFFFFFFFF9')).toBeUndefined()
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
