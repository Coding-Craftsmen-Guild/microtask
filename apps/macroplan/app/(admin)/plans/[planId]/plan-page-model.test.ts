import type { Plan } from '@repo/api-client'
import { PlanView } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { atlasPlan } from '../../../../components/plan/testing/plan-fixture'
import { planPageModel } from './plan-page-model'

// The fixture's stored plan is a manifest plus a schedule, which is exactly `PlanView` for a caller
// the API clears for `share:read` — so this is the object the admin's own read hands back.
const asServed = (): Plan => atlasPlan()

describe('the model the plan page renders from', () => {
  it('drops the seats, key and all, rather than emptying or undefining them', () => {
    const model = planPageModel(asServed())
    expect(Object.keys(model)).not.toContain('shareLinks')
    expect(JSON.stringify(model)).not.toContain('shareLinks')
    for (const seat of asServed().shareLinks ?? []) {
      expect(JSON.stringify(model)).not.toContain(seat.token)
    }
  })

  it('carries every other field of the view, so the reduction costs the timeline nothing', () => {
    const served = asServed()
    const model = planPageModel(served)
    expect(Object.keys(model).sort()).toEqual(
      Object.keys(PlanView.shape)
        .filter((field) => field !== 'shareLinks')
        .sort(),
    )
    expect(model).toEqual(
      Object.fromEntries(Object.entries(served).filter(([field]) => field !== 'shareLinks')),
    )
  })

  it('reduces a plan the caller was refused the block on to the very same model', () => {
    const { shareLinks, ...withoutTheBlock } = asServed()
    expect(shareLinks).toHaveLength(3)
    expect(planPageModel(withoutTheBlock)).toEqual(planPageModel(asServed()))
    expect(Object.keys(planPageModel(withoutTheBlock))).not.toContain('shareLinks')
  })
})
