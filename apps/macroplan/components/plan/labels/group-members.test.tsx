import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, LABEL_1, PLAN_A } from '../testing/plan-fixture'
import { GroupMembers, MEMBER_WORDS } from './group-members'
import { joinMembers, memberRows } from './member-rows'

afterEach(cleanup)

const plan = planScreenModel(atlasPlan())

const sent: { planId: string; featureId: string; labelId: string | null }[] = []

const setLabel = async (planId: string, featureId: string, labelId: string | null) => {
  sent.push({ planId, featureId, labelId })
  return { ok: true as const, value: planScreenModel(atlasPlan()) }
}

const draw = (labelId = LABEL_1) => {
  sent.length = 0
  return render(
    <GroupMembers
      labelId={labelId}
      options={joinMembers(memberRows(plan, labelId))}
      planId={PLAN_A}
      setLabel={setLabel}
    />,
  )
}

const boxFor = (featureId: string): HTMLInputElement => {
  const found = document.querySelector<HTMLInputElement>(`input[value="${featureId}"]`)
  if (found === null) throw new Error(`no box for ${featureId}`)
  return found
}

describe('what the group drawer says is in the group', () => {
  it('offers every feature of the plan as a box, not only the ones already in', () => {
    draw()

    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(plan.features.length)
  })

  it('checks the ones in this group and leaves the rest clear', () => {
    draw()

    expect(boxFor(FEATURE_1).checked).toBe(true)
    expect(boxFor(FEATURE_2).checked).toBe(false)
  })

  it('names each feature and the rail it is on, a group being the thing that spans rails', () => {
    draw()
    const rows = [...document.querySelectorAll('[data-slot="group-members"] label')]

    expect(rows).toHaveLength(plan.features.length)
    for (const [index, row] of rows.entries()) {
      const row0 = memberRows(plan, LABEL_1)[index]
      expect(row.textContent).toContain(row0?.name)
      expect(row.textContent).toContain(row0?.rail)
    }
  })

  it('counts what is in, so an empty group says so rather than reading as a fault', () => {
    draw()

    expect(screen.getByText(MEMBER_WORDS.count(1))).toBeTruthy()
  })
})

describe('what ticking a box writes', () => {
  it('puts a feature in this group by naming the group, which is the feature’s own field', () => {
    draw()

    fireEvent.click(boxFor(FEATURE_2))

    expect(sent).toEqual([{ planId: PLAN_A, featureId: FEATURE_2, labelId: LABEL_1 }])
  })

  it('takes one out by naming no group at all, null being the only way out', () => {
    draw()

    fireEvent.click(boxFor(FEATURE_1))

    expect(sent).toEqual([{ planId: PLAN_A, featureId: FEATURE_1, labelId: null }])
  })

  it('sends one write per tick and never one per row, the list being one control', () => {
    draw()

    fireEvent.click(boxFor(FEATURE_2))
    fireEvent.click(boxFor(FEATURE_1))

    expect(sent).toHaveLength(2)
  })
})

describe('a group that could hold nothing', () => {
  it('says the plan has no features rather than drawing an empty list with a count of none', () => {
    render(
      <GroupMembers labelId={LABEL_1} options="" planId={PLAN_A} setLabel={setLabel} />,
    )

    expect(screen.getByText(MEMBER_WORDS.empty)).toBeTruthy()
    expect(document.querySelectorAll('input[type="checkbox"]')).toHaveLength(0)
  })
})
