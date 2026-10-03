import { describe, expect, it, vi } from 'vitest'
import { memoOnPlan } from './memo-on-plan'

describe('memoOnPlan derives once per plan object', () => {
  it('answers the same value for the same plan without deriving it again', () => {
    const derive = vi.fn((plan: { readonly n: number }) => ({ doubled: plan.n * 2 }))
    const memo = memoOnPlan(derive)
    const plan = { n: 2 }
    expect(memo(plan)).toBe(memo(plan))
    expect(derive).toHaveBeenCalledOnce()
  })

  it('derives again for a new plan object, which is what the store makes on every change', () => {
    const derive = vi.fn((plan: { readonly n: number }) => plan.n)
    const memo = memoOnPlan(derive)
    expect([memo({ n: 1 }), memo({ n: 1 })]).toEqual([1, 1])
    expect(derive).toHaveBeenCalledTimes(2)
  })

  it('keeps a derived undefined rather than deriving it again', () => {
    const derive = vi.fn(() => undefined)
    const memo = memoOnPlan(derive)
    const plan = {}
    memo(plan)
    memo(plan)
    expect(derive).toHaveBeenCalledOnce()
  })
})
