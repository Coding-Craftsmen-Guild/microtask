import type { Plan } from '@repo/api-client'
import { PlanView } from '@repo/contracts'
import { describe, expect, it } from 'vitest'
import { planScreenModel, type PlanScreenModel } from './plan-screen-model'
import { atlasPlan } from './testing/plan-fixture'

// The fixture's stored plan is a manifest plus a schedule, which is exactly `PlanView` for a caller
// the API clears for `share:read` — so this is the object either surface's own read hands back.
const asServed = (): Plan => atlasPlan()

describe('the model both plan surfaces render from', () => {
  it('drops the seats, key and all, rather than emptying or undefining them', () => {
    const model = planScreenModel(asServed())
    expect(Object.keys(model)).not.toContain('shareLinks')
    expect(JSON.stringify(model)).not.toContain('shareLinks')
    for (const seat of asServed().shareLinks ?? []) {
      expect(JSON.stringify(model)).not.toContain(seat.token)
    }
  })

  it('carries every other field of the view, so the reduction costs the timeline nothing', () => {
    const served = asServed()
    const model = planScreenModel(served)
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
    expect(planScreenModel(withoutTheBlock)).toEqual(planScreenModel(asServed()))
    expect(Object.keys(planScreenModel(withoutTheBlock))).not.toContain('shareLinks')
  })

  // This is the consolidation's whole point, and it is a *type* assertion rather than a runtime one:
  // both surfaces' reads return this type and `PlanScreen` takes it, so there is one mechanism and
  // not two. The comment cannot fail, so the check below is what stands for it — `@ts-expect-error`
  // fails the typecheck if the assignment it marks ever starts compiling, which is exactly the
  // regression this module exists to prevent.
  it('is a type a plan carrying the block cannot be assigned to', () => {
    const served = asServed()
    // @ts-expect-error a plan with a `shareLinks` block is not a PlanScreenModel (TS2375)
    const unreduced: PlanScreenModel = served
    expect(unreduced.name).toBe('Atlas rollout')
  })
})
