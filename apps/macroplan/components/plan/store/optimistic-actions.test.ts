import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import type { PlanEditActions } from '../edit-actions'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, FEATURE_1, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { optimisticActions } from './optimistic-actions'
import { createPlanStore } from './plan-store'

type Answer = ActionResult<PlanScreenModel>

const MEMBERS: readonly (keyof PlanEditActions)[] = [
  'createEpic', 'renameEpic', 'recolourEpic', 'reorderEpic', 'removeEpic',
  'createLabel', 'renameLabel', 'recolourLabel', 'removeLabel', 'labelFeature',
  'createFeature', 'renameFeature', 'estimateFeature', 'pinFeature', 'placeFeature', 'setDependencies', 'removeFeature',
  'createItem', 'renameItem', 'estimateItem', 'describeItem', 'placeItem', 'removeItem',
  'bindEpic', 'unbindEpic', 'linkItem', 'unlinkItem', 'createTask',
]

const atlas = () => planScreenModel(atlasPlan())

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

const pending = () => new Promise<Answer>(() => undefined)

const rawActions = (send: () => Promise<Answer>): PlanEditActions =>
  Object.fromEntries(MEMBERS.map((name) => [name, vi.fn(send)])) as unknown as PlanEditActions

const harness = (send: () => Promise<Answer> = pending) => {
  const store = createPlanStore(atlas())
  const raw = rawActions(send)
  return { store, raw, writes: optimisticActions(raw, store) }
}

describe('optimisticActions puts every write through the store', () => {
  it('wraps every member, and nothing else', () => {
    expect(Object.keys(harness().writes).sort()).toEqual([...MEMBERS].sort())
  })

  it('shows a change before the answer and sends the very arguments it was called with', async () => {
    const { store, raw, writes } = harness()
    void writes.estimateItem(PLAN_A, ITEM_1, 6)
    expect(store.getSnapshot().plan.items.find((one) => one.id === ITEM_1)?.estimateDays).toBe(6)
    await tick()
    expect(raw.estimateItem).toHaveBeenCalledWith(PLAN_A, ITEM_1, 6)
  })

  it('resolves with what the action answered', async () => {
    const answer: Answer = { ok: true, value: { ...atlas(), name: 'Answered' } }
    const { writes } = harness(() => Promise.resolve(answer))
    expect(await writes.renameFeature(PLAN_A, FEATURE_1, 'Auth v2')).toBe(answer)
  })

  it('shows a created feature under a placeholder id until the answer names the real one', () => {
    const { store, writes } = harness()
    void writes.createFeature(PLAN_A, { epicId: EPIC_1, name: 'New feature' })
    expect(store.getSnapshot().plan.features.at(-1)?.id).toMatch(/^pending:/)
  })

  it('gives two creates two placeholders', () => {
    const { store, writes } = harness()
    void writes.createItem(PLAN_A, { featureId: FEATURE_1, name: 'One' })
    void writes.createItem(PLAN_A, { featureId: FEATURE_1, name: 'Two' })
    const ids = store.getSnapshot().plan.items.slice(-2).map((one) => one.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('changes nothing on screen for a bridge write, whose answer is what says what it did', async () => {
    const { store, raw, writes } = harness()
    const before = store.getSnapshot().plan
    void writes.bindEpic(PLAN_A, EPIC_1, { token: 'x', role: 'view' } as never)
    expect(store.getSnapshot().plan.epics).toEqual(before.epics)
    await tick()
    expect(raw.bindEpic).toHaveBeenCalledTimes(1)
  })
})
