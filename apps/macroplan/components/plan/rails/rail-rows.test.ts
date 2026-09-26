import { describe, expect, it } from 'vitest'
import { EPIC_1, EPIC_2, EPIC_3, atlasPlan, railedPlan } from '../testing/plan-fixture'
import { planScreenModel } from '../plan-screen-model'
import { railRows } from './rail-rows'

const rows = (plan: ReturnType<typeof atlasPlan>) => railRows(planScreenModel(plan))

describe('railRows', () => {
  it('answers one row per rail with its name, hue and lane', () => {
    expect(rows(atlasPlan())).toEqual([
      { id: EPIC_1, name: 'Platform', colour: '#3b82f6', railOrder: 0, features: 2 },
    ])
  })

  it('counts the features on each rail, which is what a delete has to say it would take', () => {
    const counted = rows(railedPlan())
    expect(counted.find((row) => row.id === EPIC_1)?.features).toBe(2)
    expect(counted.find((row) => row.id === EPIC_2)?.features).toBeGreaterThan(0)
  })

  it('orders by railOrder and not by the stored array, so the list agrees with the canvas', () => {
    const plan = railedPlan()
    const reversed = { ...plan, epics: [...plan.epics].reverse() }
    expect(rows(reversed).map((row) => row.railOrder)).toEqual(
      [...rows(reversed)].map((row) => row.railOrder).sort((left, right) => left - right),
    )
    expect(rows(reversed).map((row) => row.id)).toEqual(rows(plan).map((row) => row.id))
  })

  it('counts a rail nothing sits on as zero rather than leaving it out', () => {
    const plan = atlasPlan()
    const withEmpty = {
      ...plan,
      epics: [
        ...plan.epics,
        {
          id: EPIC_3,
          name: 'Spare',
          colour: '#111111',
          railOrder: 1,
          binding: null,
          createdAt: plan.createdAt,
          updatedAt: plan.updatedAt,
        },
      ],
    }
    expect(rows(withEmpty).at(-1)).toEqual({
      id: EPIC_3,
      name: 'Spare',
      colour: '#111111',
      railOrder: 1,
      features: 0,
    })
  })

  it('answers nothing for a plan with no rails, which is the state the panel invites one in', () => {
    expect(rows({ ...atlasPlan(), epics: [] })).toEqual([])
  })
})
