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

  it('keeps what a chain stored before it was refused part-way', async () => {
    const store = createPlanStore(atlas())
    const stored = answered(5, '2026-09-24T00:00:00.000Z')
    const chain: PlanOp = {
      apply: sized(9),
      send: (confirm) => {
        if (stored.ok) confirm(stored.value)
        return Promise.resolve({ ok: false, status: 409, detail: 'Second step refused.' })
      },
    }
    await store.run(chain)
    expect(estimateOf(store.getSnapshot().plan, ITEM_1)).toBe(5)
    expect(store.getSnapshot().failure).toBe('Second step refused.')
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

// A write outside the queue — a plan rename, which re-renders — can land between two of a chain's steps,
// and its plan is adopted; an answer stamped before it must not take it back.
describe('the confirmed plan never moves back in time', () => {
  const renamed = (stamp: string): PlanScreenModel => ({ ...atlas(), name: 'Renamed', updatedAt: stamp })

  it('keeps a newer plan adopted while a write was out, when that write answers with an older one', async () => {
    const store = createPlanStore(atlas())
    const out = deferred()
    const sent = store.run(op(7, () => out.promise))
    store.adopt(renamed('2026-09-27T00:00:00.000Z'))
    out.resolve(answered(7, '2026-09-26T00:00:00.000Z'))
    await sent
    expect(store.getSnapshot().plan.name).toBe('Renamed')
  })

  it('keeps a newer plan adopted mid-chain when the chain is refused part-way', async () => {
    const store = createPlanStore(atlas())
    const stored = answered(5, '2026-09-26T00:00:00.000Z')
    const refusal = deferred()
    const sent = store.run({
      apply: sized(9),
      send: (confirm) => {
        if (stored.ok) confirm(stored.value)
        return refusal.promise
      },
    })
    await settle()
    store.adopt(renamed('2026-09-27T00:00:00.000Z'))
    refusal.resolve({ ok: false, status: 409, detail: 'Second step refused.' })
    await sent
    expect(store.getSnapshot().plan.name).toBe('Renamed')
    expect(store.getSnapshot().failure).toBe('Second step refused.')
  })
})

describe('a placeholder is named by the answer to its create', () => {
  it('reads every id as itself until something names it', () => {
    const store = createPlanStore(atlas())
    expect(store.real('pending:a')).toBe('pending:a')
    expect(store.real(FEATURE_1)).toBe(FEATURE_1)
    expect(store.first(FEATURE_1)).toBe(FEATURE_1)
  })

  it('is named from inside a send, and every queued edit re-applies under the real id at once', async () => {
    const store = createPlanStore(atlas())
    const seen: string[] = []
    const heard = vi.fn()
    store.subscribe(heard)
    void store.run({
      apply: (plan) => {
        seen.push(store.real('pending:b'))
        return plan
      },
      send: (_confirm, name) => {
        name('pending:b', 'REAL_B')
        return deferred().promise
      },
    })
    await settle()
    expect(store.real('pending:b')).toBe('REAL_B')
    expect(seen.at(-1)).toBe('REAL_B')
    expect(heard).toHaveBeenCalledTimes(2)
  })

  it('remembers the placeholder a real id was first drawn under, which is what keeps a drawer mounted', async () => {
    const store = createPlanStore(atlas())
    await store.run({
      apply: (plan) => plan,
      send: (_confirm, name) => {
        name('pending:c', 'REAL_C')
        return Promise.resolve(answered(3, '2026-09-26T00:00:00.000Z'))
      },
    })
    expect(store.first('REAL_C')).toBe('pending:c')
    expect(store.first('pending:c')).toBe('pending:c')
  })
})

describe('a queued change that changes nothing', () => {
  it('leaves the plan the same object, so nothing keyed on it recomputes', () => {
    const store = createPlanStore(atlas())
    const before = store.getSnapshot().plan
    void store.run({ apply: (plan) => plan, send: () => deferred().promise })
    expect(store.getSnapshot().plan).toBe(before)
    expect(store.getSnapshot().saving).toBe(true)
  })
})
