import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import {
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  LABEL_1,
  LABEL_2,
  railedPlan,
} from '../testing/plan-fixture'
import { joinMembers, memberRows, splitMembers } from './member-rows'

const plan = planScreenModel(atlasPlan())

describe('every feature a group could hold, and which of them it does', () => {
  it('lists every feature of the plan, not only the ones already in the group', () => {
    const rows = memberRows(plan, LABEL_1)

    expect(rows.map((row) => row.id)).toEqual(plan.features.map((feature) => feature.id))
  })

  it('marks the ones in this group and leaves the rest unmarked, which is what the boxes read', () => {
    const rows = memberRows(plan, LABEL_1)

    expect(rows.find((row) => row.id === FEATURE_1)?.inGroup).toBe(true)
    expect(rows.find((row) => row.id === FEATURE_2)?.inGroup).toBe(false)
  })

  it('marks nothing for a group no feature is in, which is a group that reads as empty', () => {
    expect(memberRows(plan, LABEL_2).some((row) => row.inGroup)).toBe(false)
  })

  it('counts a feature in another group as out of this one, there being one group per feature', () => {
    const rows = memberRows(plan, LABEL_2)

    expect(rows.find((row) => row.id === FEATURE_1)?.inGroup).toBe(false)
  })

  // A group's whole point is that it cuts across rails, so the rail is the one fact worth carrying
  // beside the name: "two features, four rails apart" is the thing a reader made the group to see.
  it('names each feature’s rail beside it, a group being the thing that spans them', () => {
    const rows = memberRows(planScreenModel(railedPlan()), LABEL_1)
    const named = rows.find((row) => row.id === FEATURE_1)

    expect(named?.rail).toBe(
      railedPlan().epics.find((epic) => epic.id === EPIC_1)?.name,
    )
  })

  it('says the same words the board does for a rail no epic claims, rather than an empty cell', () => {
    const bare = atlasPlan({ epics: [] })
    const rows = memberRows(planScreenModel(bare), LABEL_1)

    expect(rows.every((row) => row.rail === 'Unclaimed rail')).toBe(true)
  })
})

describe('the one string this list crosses a client boundary in', () => {
  it('round-trips every row, so the picker reads back exactly what the server listed', () => {
    const rows = memberRows(plan, LABEL_1)

    expect(splitMembers(joinMembers(rows))).toEqual(rows)
  })

  it('answers nothing for a plan with no features rather than one empty row', () => {
    expect(splitMembers(joinMembers([]))).toEqual([])
    expect(joinMembers([])).toBe('')
  })

  it('keeps a name holding spaces intact, the separators being ones a stored name cannot hold', () => {
    const rows = [{ id: FEATURE_1, name: 'Re-run migrate on all three', rail: 'Platform rail', inGroup: true }]

    expect(splitMembers(joinMembers(rows))).toEqual(rows)
  })
})
