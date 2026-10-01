import type { Plan } from '@repo/api-client'
import { describe, expect, it } from 'vitest'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, FEATURE_2, LABEL_1, LABEL_2 } from '../testing/plan-fixture'
import { groupFits } from './group-fit'

const model = (plan: Plan) => planScreenModel(plan)

/** The fixture with each named feature moved into a group, so a span can be built to order. */
const grouped = (into: Readonly<Record<string, string | null>>): Plan => {
  const plan = atlasPlan()
  return {
    ...plan,
    features: plan.features.map((feature) =>
      feature.id in into ? { ...feature, labelId: into[feature.id] ?? null } : feature,
    ),
  }
}

/** The same plan with one feature's span replaced, to make a group as wide as a test needs. */
const spanning = (plan: Plan, id: string, startDay: number, endDay: number): Plan => ({
  ...plan,
  schedule: {
    ...plan.schedule,
    spans: plan.schedule.spans.map((span) => (span.id === id ? { id, startDay, endDay } : span)),
  },
})

describe('the span a group covers', () => {
  it('runs from its first feature’s first day to its last feature’s last', () => {
    const plan = grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_1 })
    expect(groupFits(model(plan)).get(LABEL_1)?.day).toBe(0)
  })

  it('starts at the group’s own first day, not at the plan’s', () => {
    const plan = grouped({ [FEATURE_1]: LABEL_2, [FEATURE_2]: LABEL_1 })
    expect(groupFits(model(plan)).get(LABEL_1)?.day).toBe(5)
  })

  it('ignores a feature in another group, which is what makes the chips differ at all', () => {
    const wide = spanning(grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 }), FEATURE_2, 5, 400)
    expect(groupFits(model(wide)).get(LABEL_1)?.rung).toBe('item')
    expect(groupFits(model(wide)).get(LABEL_2)?.rung).toBe('epic')
  })

  it('offers nothing for a group holding no features, there being no window to fit to', () => {
    expect(groupFits(model(grouped({ [FEATURE_1]: LABEL_1 }))).get(LABEL_2)).toBeUndefined()
  })

  it('offers nothing for a group whose every feature the pass could not place', () => {
    const plan = grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 })
    const unplaced = {
      ...plan,
      schedule: {
        ...plan.schedule,
        spans: plan.schedule.spans.filter((span) => span.id !== FEATURE_1),
      },
    }
    expect(groupFits(model(unplaced)).get(LABEL_1)).toBeUndefined()
    expect(groupFits(model(unplaced)).get(LABEL_2)).toBeDefined()
  })
})

describe('the stop a group is fitted at', () => {
  it('shows items for a group inside two sprints, which is the Sprint stop’s own threshold', () => {
    const plan = spanning(grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 }), FEATURE_1, 0, 20)
    expect(groupFits(model(plan)).get(LABEL_1)?.rung).toBe('item')
  })

  it('widens to the Quarter stop for a group too long for Sprint', () => {
    const plan = spanning(grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 }), FEATURE_1, 0, 60)
    expect(groupFits(model(plan)).get(LABEL_1)?.rung).toBe('feature')
  })

  it('widens to the Year stop for a group too long for Quarter', () => {
    const plan = spanning(grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 }), FEATURE_1, 0, 400)
    expect(groupFits(model(plan)).get(LABEL_1)?.rung).toBe('epic')
  })

  it('measures the group’s own length and not where it sits, two of one width fitting alike', () => {
    const early = spanning(grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 }), FEATURE_1, 0, 15)
    const late = spanning(grouped({ [FEATURE_1]: LABEL_1, [FEATURE_2]: LABEL_2 }), FEATURE_1, 300, 315)
    expect(groupFits(model(late)).get(LABEL_1)?.rung).toBe(
      groupFits(model(early)).get(LABEL_1)?.rung,
    )
    expect(groupFits(model(late)).get(LABEL_1)?.day).toBe(300)
  })
})
