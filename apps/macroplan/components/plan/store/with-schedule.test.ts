import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, beaconPlan, FEATURE_1, FEATURE_2, ITEM_1, ITEM_3 } from '../testing/plan-fixture'
import { changeItem } from './item-edits'
import { withSchedule } from './with-schedule'

const spanOf = (plan: ReturnType<typeof withSchedule>, id: string) =>
  plan.schedule.spans.find((one) => one.id === id)

describe('withSchedule recomputes the schedule the API would answer', () => {
  it('agrees with the schedule the API answered for the fixture plan, span for span', () => {
    const plan = planScreenModel(atlasPlan())
    expect(withSchedule(plan).schedule).toEqual(plan.schedule)
  })

  it('agrees for a plan with nothing on it', () => {
    const plan = planScreenModel(beaconPlan())
    expect(withSchedule(plan).schedule).toEqual(plan.schedule)
  })

  it('moves what waits on a feature when one of its items grows, since items are what size it', () => {
    const grown = withSchedule(changeItem(planScreenModel(atlasPlan()), ITEM_1, { estimateDays: 7 }))
    expect(spanOf(grown, FEATURE_1)).toMatchObject({ startDay: 0, endDay: 9 })
    expect(spanOf(grown, FEATURE_2)?.startDay).toBe(9)
    expect(spanOf(grown, ITEM_3)?.startDay).toBe(9)
  })

  it('changes nothing but the schedule', () => {
    const plan = planScreenModel(atlasPlan())
    expect({ ...withSchedule(plan), schedule: null }).toEqual({ ...plan, schedule: null })
  })
})
