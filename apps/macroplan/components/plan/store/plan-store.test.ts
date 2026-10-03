import { NO_ANSWER } from '@repo/app-session/no-answer'
import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import type { PlanScreenModel } from '../plan-screen-model'
import { planScreenModel } from '../plan-screen-model'
import { atlasPlan, FEATURE_1, ITEM_1 } from '../testing/plan-fixture'
import { changeItem } from './item-edits'
import { createPlanStore, type PlanOp } from './plan-store'

type Answer = ActionResult<PlanScreenModel>

interface Deferred {
  readonly promise: Promise<Answer>
  readonly resolve: (answer: Answer) => void
  readonly reject: (error: unknown) => void
}

const deferred = (): Deferred => {
  let resolve: (answer: Answer) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<Answer>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const atlas = (): PlanScreenModel => planScreenModel(atlasPlan())

const estimateOf = (plan: PlanScreenModel, id: string) => plan.items.find((one) => one.id === id)?.estimateDays

const sized = (days: number) => (plan: PlanScreenModel) => changeItem(plan, ITEM_1, { estimateDays: days })

const answered = (days: number, stamp: string): Answer => ({
  ok: true,
  value: { ...sized(days)(atlas()), updatedAt: stamp },
})

const op = (days: number, send: () => Promise<Answer>): PlanOp => ({ apply: sized(days), send })

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('an edit is on screen before the API answers it', () => {
  it('applies the change synchronously and says it is saving', () => {
    const store = createPlanStore(atlas())
    void store.run(op(7, () => deferred().promise))
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(7)
    expect(store.getSnapshot().saving).toBe(true)
  })

  it('recomputes the schedule with the change, so the bars move at once', () => {
    const store = createPlanStore(atlas())
    void store.run(op(7, () => deferred().promise))
    expect(store.getSnapshot().plan.schedule.spans.find((one) => one.id === FEATURE_1)?.endDay).toBe(9)
  })

  it('tells every subscriber, and stops telling one that left', () => {
    const store = createPlanStore(atlas())
    const heard = vi.fn()
    const leave = store.subscribe(heard)
    void store.run(op(7, () => deferred().promise))
    leave()
    void store.run(op(8, () => deferred().promise))
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('hands back the same snapshot until something changes', () => {
    const store = createPlanStore(atlas())
    expect(store.getSnapshot()).toBe(store.getSnapshot())
  })
})

describe('writes are sent one at a time, in the order they were made', () => {
  it('does not send the second until the first has settled', async () => {
    const store = createPlanStore(atlas())
    const first = deferred()
    const second = vi.fn(() => deferred().promise)
    void store.run(op(7, () => first.promise))
    void store.run(op(8, second))
    await settle()
    expect(second).not.toHaveBeenCalled()
    first.resolve(answered(7, '2026-09-24T00:00:00.000Z'))
    await settle()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('keeps a later edit on screen when an earlier one is answered', async () => {
    const store = createPlanStore(atlas())
    const first = deferred()
    void store.run(op(7, () => first.promise))
    void store.run(op(8, () => deferred().promise))
    first.resolve(answered(7, '2026-09-24T00:00:00.000Z'))
    await settle()
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(8)
  })

  it('shows the answered plan itself once nothing is pending', async () => {
    const store = createPlanStore(atlas())
    const answer = answered(7, '2026-09-24T00:00:00.000Z')
    await store.run(op(7, () => Promise.resolve(answer)))
    expect(store.getSnapshot().plan).toBe(answer.ok ? answer.value : null)
    expect(store.getSnapshot().saving).toBe(false)
  })
})

describe('a refused or unanswered write is taken back off the screen', () => {
  it('drops a refused edit, says why, and resolves with the refusal', async () => {
    const store = createPlanStore(atlas())
    const refusal: Answer = { ok: false, status: 409, detail: 'No.' }
    const result = await store.run(op(7, () => Promise.resolve(refusal)))
    expect(result).toBe(refusal)
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(3)
    expect(store.getSnapshot().failure).toBe('No.')
  })

  it('keeps a later edit that was not refused', async () => {
    const store = createPlanStore(atlas())
    const first = deferred()
    void store.run(op(7, () => first.promise))
    void store.run(op(8, () => deferred().promise))
    first.resolve({ ok: false, status: 403, detail: 'No.' })
    await settle()
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(8)
  })

  it('drops a write that threw, says the server did not answer, and passes the error on', async () => {
    const store = createPlanStore(atlas())
    const failing = Promise.reject(new Error('offline'))
    await expect(store.run(op(7, () => failing))).rejects.toThrow('offline')
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(3)
    expect(store.getSnapshot().failure).toBe(NO_ANSWER.detail)
  })

  it('forgets the sentence when it is dismissed', async () => {
    const store = createPlanStore(atlas())
    await store.run(op(7, () => Promise.resolve({ ok: false, status: 409, detail: 'No.' })))
    store.dismiss()
    expect(store.getSnapshot().failure).toBeNull()
  })
})

describe('a plan the server pushes replaces what was confirmed', () => {
  it('adopts a newer plan and keeps the pending edits on top of it', () => {
    const store = createPlanStore(atlas())
    void store.run(op(7, () => deferred().promise))
    store.adopt({ ...atlas(), name: 'Renamed', updatedAt: '2026-09-25T00:00:00.000Z' })
    expect(store.getSnapshot().plan.name).toBe('Renamed')
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(7)
  })

  it('ignores a plan older than the one it already confirmed', async () => {
    const store = createPlanStore(atlas())
    await store.run(op(7, () => Promise.resolve(answered(7, '2026-09-26T00:00:00.000Z'))))
    store.adopt({ ...atlas(), updatedAt: '2026-09-24T00:00:00.000Z' })
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(7)
  })
})
