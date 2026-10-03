import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import type { Draft } from '../canvas/extend-view'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
import { planGestures, type GestureWrites } from './gestures'
import { createPlanStore } from './plan-store'

type Answer = ActionResult<PlanScreenModel>

const NEW_RAIL = '01MPZZZZZZZZZZZZZZZZZZZZZ7'

const atlas = () => planScreenModel(atlasPlan())

const withRail = (): PlanScreenModel => {
  const plan = atlas()
  const first = plan.epics[0]
  if (first === undefined) throw new Error('the fixture holds no rail')
  return { ...plan, epics: [...plan.epics, { ...first, id: NEW_RAIL, name: 'New epic', railOrder: 1 }] }
}

const never = () => new Promise<Answer>(() => undefined)

const writes = (send: () => Promise<Answer> = never): GestureWrites => ({
  createEpic: vi.fn(send),
  reorderEpic: vi.fn(send),
  createFeature: vi.fn(send),
  createItem: vi.fn(send),
  placeFeature: vi.fn(send),
  placeItem: vi.fn(send),
  setDependencies: vi.fn(send),
  labelFeature: vi.fn(send),
})

const draft: Draft = {
  kind: 'feature',
  featureId: FEATURE_1,
  epicId: EPIC_1,
  position: 1,
  days: 2,
  labelId: '',
  sprint: null,
  edge: 'none',
}

describe('a draw is one change: on screen whole, persisted as a chain', () => {
  it('shows the drawn feature, placed and with its item, before any write is answered', () => {
    const store = createPlanStore(atlas())
    void planGestures(PLAN_A, writes(), store.run).draw?.(draft)
    const drawn = store.getSnapshot().plan.features.find((one) => one.id.startsWith('pending:'))
    expect(drawn).toMatchObject({ epicId: EPIC_1, position: 1, estimateDays: 2 })
    expect(store.getSnapshot().plan.items.some((one) => one.featureId === drawn?.id)).toBe(true)
  })

  it('does nothing at all on a surface that may not create what was drawn', () => {
    const store = createPlanStore(atlas())
    const held = { ...writes(), createFeature: null }
    void planGestures(PLAN_A, held, store.run).draw?.(draft)
    expect(store.getSnapshot().saving).toBe(false)
  })

  it('offers the kinds of work it may make, and no draw at all where it may make neither', () => {
    const store = createPlanStore(atlas())
    expect(planGestures(PLAN_A, { ...writes(), createItem: null }, store.run).offers).toEqual({ feature: true, item: false })
    expect(planGestures(PLAN_A, { ...writes(), createItem: null, createFeature: null }, store.run).draw).toBeNull()
  })
})

describe('a rail dropped from the strip', () => {
  it('appears in the gap it was dropped in before the API answers', () => {
    const store = createPlanStore(atlas())
    void planGestures(PLAN_A, writes(), store.run).dropRail?.({ name: 'New epic' }, 0)
    expect([...store.getSnapshot().plan.epics].sort((a, b) => a.railOrder - b.railOrder)[0]?.id).toMatch(/^pending:/)
  })

  it('creates, then moves the rail it was answered with, and resolves with that rail id', async () => {
    const store = createPlanStore(atlas())
    const held = writes(() => Promise.resolve({ ok: true, value: withRail() }))
    const made = await planGestures(PLAN_A, held, store.run).dropRail?.({ name: 'New epic' }, 0)
    expect(made).toBe(NEW_RAIL)
    expect(held.reorderEpic).toHaveBeenCalledWith(PLAN_A, NEW_RAIL, 0)
  })

  it('resolves with null when the create is refused', async () => {
    const store = createPlanStore(atlas())
    const held = writes(() => Promise.resolve({ ok: false, status: 403, detail: 'No.' }))
    expect(await planGestures(PLAN_A, held, store.run).dropRail?.({ name: 'New epic' }, 0)).toBeNull()
    expect(held.reorderEpic).not.toHaveBeenCalled()
  })

  // The create route appends, so the drop is two writes and says so. A viewer who may create a rail but
  // not reorder one gets the rail at the bottom, which is the honest outcome of what they hold.
  it('makes the create alone for a viewer who may not reorder one', async () => {
    const store = createPlanStore(atlas())
    const held = { ...writes(() => Promise.resolve({ ok: true, value: withRail() })), reorderEpic: null }
    expect(await planGestures(PLAN_A, held, store.run).dropRail?.({ name: 'New epic' }, 0)).toBe(NEW_RAIL)
    expect(held.createEpic).toHaveBeenCalledOnce()
  })

  it('writes nothing at all for a viewer who may not create one', async () => {
    const store = createPlanStore(atlas())
    const held = { ...writes(), createEpic: null }
    expect(planGestures(PLAN_A, held, store.run).dropRail).toBeNull()
    expect(held.reorderEpic).not.toHaveBeenCalled()
    expect(store.getSnapshot().saving).toBe(false)
  })
})
