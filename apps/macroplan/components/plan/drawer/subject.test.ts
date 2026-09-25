import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  ITEM_2,
  ITEM_3,
  PLAN_GONE,
} from '../testing/plan-fixture'
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
      place: {
        featureId: FEATURE_1,
        railId: EPIC_1,
        siblingIds: [FEATURE_1, FEATURE_2],
        targets: [],
      },
      plan: {
        calendar: { startDate: '2026-09-28', sprintLengthDays: 14, timezone: 'Europe/Belgrade' },
        features: atlasPlan().features,
      },
      sizedByItems: true,
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
// lookup rather than fetched beside it. `sizedByItems` is `effectiveEstimate`'s own gate — at least one
// estimated item — asked of the two exported functions rather than counted here, and every case below
// pairs it with what the row's Estimate cell reads in that same state, because the whole point of the
// boolean is that the cell and the estimate field can disagree and only this says why.
describe('whether the items sized this feature, and the states in which they did not', () => {
  const authored = (estimateDays: number | null) =>
    plan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, estimateDays } : one,
      ),
    })

  it('answers true for a feature authored against estimated items, the two being a pair', () => {
    const subject = drawerSubject(authored(40), 'feature', FEATURE_1)
    expect(subject?.values.sizedByItems).toBe(true)
    expect(subject?.row.estimate).toBe('planned 40d · broken down to 5d · -35d')
  })

  it('answers true whether the breakdown overruns what was authored or falls short of it', () => {
    expect(drawerSubject(authored(40), 'feature', FEATURE_1)?.values.sizedByItems).toBe(true)
    expect(drawerSubject(authored(1), 'feature', FEATURE_1)?.values.sizedByItems).toBe(true)
  })

  it('answers true for an authored 0 against estimated items, 0 being a milestone and not an absence', () => {
    expect(drawerSubject(authored(0), 'feature', FEATURE_1)?.values.sizedByItems).toBe(true)
  })

  it('answers true for an agreeing breakdown, which the row’s own wording collapses to one number', () => {
    const subject = drawerSubject(plan(), 'feature', FEATURE_1)
    expect(subject?.values.sizedByItems).toBe(true)
    expect(subject?.row.estimate).toBe('5d')
  })

  // The state `breakdown()` answers `null` for and the items place all the same, which is why this
  // boolean is not that call's answer. The row's cell is the reason it matters: `estimateOf` falls
  // through to `effectiveEstimate`, so the cell reads the items' own sum while the estimate field
  // beside it holds nothing at all — and this is the only thing on the panel that explains the pair.
  it('answers true where the items are sized and nobody authored an estimate beside them', () => {
    const subject = drawerSubject(authored(null), 'feature', FEATURE_1)
    expect(subject?.values.sizedByItems).toBe(true)
    expect(subject?.values.estimateDays).toBeNull()
    expect(subject?.row.estimate).toBe('5d')
  })

  // Nothing here may test for truth. With nothing authored and every item a milestone the items still
  // size the feature, at 0 — and `effectiveEstimate` answers `0`, which a truthiness check would read
  // as the absence that leaves an authored value standing.
  it('answers true where nothing was authored and every item is a milestone, 0 being an answer', () => {
    const milestones = plan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, estimateDays: null } : one,
      ),
      items: atlasPlan().items.map((one) => ({ ...one, estimateDays: 0 })),
    })
    const subject = drawerSubject(milestones, 'feature', FEATURE_1)
    expect(subject?.values.sizedByItems).toBe(true)
    expect(subject?.row.estimate).toBe('0d')
  })

  it('answers false where the feature has items and not one of them is estimated', () => {
    const unsized = plan({
      items: atlasPlan().items.map((one) => ({ ...one, estimateDays: null })),
    })
    const subject = drawerSubject(unsized, 'feature', FEATURE_1)
    expect(subject?.values.sizedByItems).toBe(false)
    expect(subject?.row.estimate).toBe('5d')
  })

  it('answers false where the feature has no items at all, its own estimate placing it', () => {
    expect(drawerSubject(plan({ items: [] }), 'feature', FEATURE_1)?.values.sizedByItems).toBe(false)
  })

  it('answers false where neither the feature nor an item of it is sized', () => {
    const nothing = plan({
      features: atlasPlan().features.map((one) =>
        one.id === FEATURE_1 ? { ...one, estimateDays: null } : one,
      ),
      items: atlasPlan().items.map((one) => ({ ...one, estimateDays: null })),
    })
    const subject = drawerSubject(nothing, 'feature', FEATURE_1)
    expect(subject?.values.sizedByItems).toBe(false)
    expect(subject?.row.estimate).toBe('no estimate')
  })

  it('answers false for every item, an item having no items of its own', () => {
    expect(drawerSubject(plan(), 'item', ITEM_1)?.values.sizedByItems).toBe(false)
  })

  // The filter is by `featureId`, so a sibling feature's items may not answer this question: FEATURE_1
  // keeps both of its items here and FEATURE_2 is left with none, so a read of `plan.items` would say
  // true for a feature nothing under it sizes.
  it('asks about this feature’s own items and not the plan’s, which is what the filter is for', () => {
    const moved = plan({ items: atlasPlan().items.filter((one) => one.featureId === FEATURE_1) })
    expect(drawerSubject(moved, 'feature', FEATURE_1)?.values.sizedByItems).toBe(true)
    expect(drawerSubject(moved, 'feature', FEATURE_2)?.values.sizedByItems).toBe(false)
  })
})

describe('the calendar it carries, which is the plan’s three scheduling fields and nothing else', () => {
  it('answers the plan’s own start date, sprint length and zone', () => {
    const at = atlasPlan()
    expect(drawerSubject(plan(), 'feature', FEATURE_1)?.values.plan.calendar).toEqual({
      startDate: at.startDate,
      sprintLengthDays: at.sprintLengthDays,
      timezone: at.timezone,
    })
  })

  it('carries exactly three fields, so nothing plan-shaped rides along inside it', () => {
    const calendar = drawerSubject(plan(), 'item', ITEM_1)?.values.plan.calendar
    expect(Object.keys(calendar ?? {}).sort()).toEqual([
      'sprintLengthDays',
      'startDate',
      'timezone',
    ])
  })

  it('answers it for an item too, a sprint meaning the same dates whichever subject is open', () => {
    expect(drawerSubject(plan(), 'item', ITEM_1)?.values.plan.calendar.sprintLengthDays).toBe(14)
  })
})

describe('the place group, which is where this subject sits and the parents around it', () => {
  it('answers a feature its own id as the parent a new item joins, and its epic as the rail', () => {
    expect(drawerSubject(plan(), 'feature', FEATURE_1)?.values.place).toEqual({
      featureId: FEATURE_1,
      railId: EPIC_1,
      siblingIds: [FEATURE_1, FEATURE_2],
      targets: [],
    })
  })

  // The second lookup, which is the reason this is resolved here rather than by the panel: an item
  // knows its feature and the panel is handed neither the item record nor the plan.
  it('answers an item its own feature, so "add an item" means the feature and never the item', () => {
    expect(drawerSubject(plan(), 'item', ITEM_1)?.values.place).toEqual({
      featureId: FEATURE_1,
      railId: EPIC_1,
      siblingIds: [ITEM_1, ITEM_2],
      targets: [{ id: FEATURE_2, name: 'Billing' }],
    })
  })

  it('orders the siblings by their stored positions, so an index in the list is a position', () => {
    const reversed = plan({
      items: atlasPlan()
        .items.map((one) => (one.id === ITEM_1 ? { ...one, position: 5 } : one))
        .reverse(),
    })
    expect(drawerSubject(reversed, 'item', ITEM_1)?.values.place.siblingIds).toEqual([ITEM_2, ITEM_1])
  })

  // A feature moves between **rails** and an item between **features**, because that is what each
  // placement payload names — and neither list holds the subject's own parent, so no control can offer to
  // move it where it already is.
  it('offers a feature the plan’s other rails, named, and never the rail it is already on', () => {
    const twoRails = plan({
      epics: [
        ...atlasPlan().epics,
        {
          id: 'epic-two',
          name: 'Payments',
          colour: '#112233',
          railOrder: 1,
          binding: null,
          createdAt: '2026-09-01T09:00:00.000Z',
          updatedAt: '2026-09-01T09:00:00.000Z',
        },
      ],
    })
    expect(drawerSubject(twoRails, 'feature', FEATURE_1)?.values.place.targets).toEqual([
      { id: 'epic-two', name: 'Payments' },
    ])
  })

  it('offers an item the plan’s other features and never the one it is under', () => {
    expect(drawerSubject(plan(), 'item', ITEM_3)?.values.place.targets).toEqual([
      { id: FEATURE_1, name: 'Auth rewrite' },
    ])
  })

  it('answers the item’s own feature and not the plan’s first, for an item on another feature', () => {
    expect(drawerSubject(plan(), 'item', ITEM_3)?.values.place.featureId).toBe(FEATURE_2)
  })

  // `railsOf` gives such a feature a rail of its own and the table words it `Unclaimed rail`, so the
  // panel is on screen while `FeatureService.add` would answer `assertEpic` with a 404 for that id.
  it('answers no rail where no epic of the plan claims the feature, rather than an id that 404s', () => {
    const orphaned = plan({ epics: [] })
    expect(drawerSubject(orphaned, 'feature', FEATURE_1)?.row.epic).toBe('Unclaimed rail')
    expect(drawerSubject(orphaned, 'feature', FEATURE_1)?.values.place.railId).toBeNull()
    expect(drawerSubject(orphaned, 'feature', FEATURE_1)?.values.place.featureId).toBe(FEATURE_1)
  })

  it('answers no rail for an item under such a feature either, the rail being the feature’s', () => {
    expect(drawerSubject(plan({ epics: [] }), 'item', ITEM_2)?.values.place.railId).toBeNull()
  })

  it('carries exactly four members, so nothing feature-shaped or plan-shaped rides along in it', () => {
    const place = drawerSubject(plan(), 'item', ITEM_1)?.values.place
    expect(Object.keys(place ?? {}).sort()).toEqual([
      'featureId',
      'railId',
      'siblingIds',
      'targets',
    ])
  })

  it('carries ids and names and nothing else in a target, so no record rides along in one', () => {
    const targets = drawerSubject(plan(), 'item', ITEM_3)?.values.place.targets ?? []
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) expect(Object.keys(target).sort()).toEqual(['id', 'name'])
  })
})
