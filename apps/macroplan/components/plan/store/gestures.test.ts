import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import type { Draft } from '../canvas/extend-view'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
import { addFeature } from './feature-edits'
import { planGestures, type GestureWrites } from './gestures'
import { addItem } from './item-edits'
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
    void planGestures(PLAN_A, writes(), store).draw?.(draft)
    const drawn = store.getSnapshot().plan.features.find((one) => one.id.startsWith('pending:'))
    expect(drawn).toMatchObject({ epicId: EPIC_1, position: 1, estimateDays: 2 })
    expect(store.getSnapshot().plan.items.some((one) => one.featureId === drawn?.id)).toBe(true)
  })

  it('does nothing at all on a surface that may not create what was drawn', () => {
    const store = createPlanStore(atlas())
    const held = { ...writes(), createFeature: null }
    void planGestures(PLAN_A, held, store).draw?.(draft)
    expect(store.getSnapshot().saving).toBe(false)
  })

  it('offers the kinds of work it may make, and no draw at all where it may make neither', () => {
    const store = createPlanStore(atlas())
    expect(planGestures(PLAN_A, { ...writes(), createItem: null }, store).offers).toEqual({ feature: true, item: false })
    expect(planGestures(PLAN_A, { ...writes(), createItem: null, createFeature: null }, store).draw).toBeNull()
  })
})

// What the API answers as two draws are stored: each feature and its one item appended where it appends.
const drawnOn = (plan: PlanScreenModel, feature: string, item: string): PlanScreenModel => {
  const featured = addFeature(plan, { epicId: EPIC_1, name: 'New feature' }, feature)
  return addItem(featured, { featureId: feature, name: 'New item' }, item)
}

const AFTER_A = (): PlanScreenModel => drawnOn(atlas(), 'REAL_FA', 'REAL_IA')

const AFTER_B = (): PlanScreenModel => drawnOn(AFTER_A(), 'REAL_FB', 'REAL_IB')

const twoDraws = (): GestureWrites => {
  const inTurn = () =>
    vi
      .fn<() => Promise<Answer>>()
      .mockResolvedValueOnce({ ok: true, value: AFTER_A() })
      .mockResolvedValueOnce({ ok: true, value: AFTER_B() })
  const rest = writes(() => Promise.resolve<Answer>({ ok: true, value: AFTER_B() }))
  return { ...rest, createFeature: inTurn(), createItem: inTurn() }
}

const drained = async () => {
  for (let turn = 0; turn < 12; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const pendingFeature = (plan: PlanScreenModel): string =>
  plan.features.find((one) => one.id.startsWith('pending:'))?.id ?? ''

describe('a draw names what it drew, so what is done to it meanwhile reaches the API', () => {
  it('names the drawn feature and its item the moment each create is answered', async () => {
    const store = createPlanStore(atlas())
    const drawing = planGestures(PLAN_A, twoDraws(), store).draw?.(draft)
    const placeholder = pendingFeature(store.getSnapshot().plan)
    await drawing
    expect(store.real(placeholder)).toBe('REAL_FA')
    expect(store.getSnapshot().plan.features.some((one) => one.id.startsWith('pending:'))).toBe(false)
  })

  it('draws a second feature from the end of one still being saved under that feature’s real id', async () => {
    const store = createPlanStore(atlas())
    const held = twoDraws()
    const gestures = planGestures(PLAN_A, held, store)
    void gestures.draw?.(draft)
    const first = pendingFeature(store.getSnapshot().plan)
    void gestures.draw?.({ ...draft, featureId: first, edge: 'new-waits' })
    await drained()
    expect(held.setDependencies).toHaveBeenCalledWith(PLAN_A, 'REAL_FB', ['REAL_FA'])
  })
})

describe('a rail dropped from the strip', () => {
  it('appears in the gap it was dropped in before the API answers', () => {
    const store = createPlanStore(atlas())
    void planGestures(PLAN_A, writes(), store).dropRail?.({ name: 'New epic' }, 0)
    expect([...store.getSnapshot().plan.epics].sort((a, b) => a.railOrder - b.railOrder)[0]?.id).toMatch(/^pending:/)
  })

  // At once, so its drawer opens in the frame the rail appears in rather than over whatever the reader
  // opened while the chain was out.
  it('resolves at once with the id it is drawn under, before any write is answered', async () => {
    const store = createPlanStore(atlas())
    const made = await planGestures(PLAN_A, writes(), store).dropRail?.({ name: 'New epic' }, 0)
    expect(made).toMatch(/^pending:/)
    expect(store.getSnapshot().saving).toBe(true)
  })

  it('creates, then moves the rail it was answered with, which is what that id is read as from then on', async () => {
    const store = createPlanStore(atlas())
    const held = writes(() => Promise.resolve({ ok: true, value: withRail() }))
    const made = await planGestures(PLAN_A, held, store).dropRail?.({ name: 'New epic' }, 0)
    await drained()
    expect(held.reorderEpic).toHaveBeenCalledWith(PLAN_A, NEW_RAIL, 0)
    expect(store.real(made ?? '')).toBe(NEW_RAIL)
  })

  it('takes the rail back off the plan and moves nothing when the create is refused', async () => {
    const store = createPlanStore(atlas())
    const held = writes(() => Promise.resolve({ ok: false, status: 403, detail: 'No.' }))
    await planGestures(PLAN_A, held, store).dropRail?.({ name: 'New epic' }, 0)
    await drained()
    expect(held.reorderEpic).not.toHaveBeenCalled()
    expect(store.getSnapshot().plan.epics.some((one) => one.id.startsWith('pending:'))).toBe(false)
    expect(store.getSnapshot().failure).toBe('No.')
  })

  // The create route appends, so the drop is two writes and says so. A viewer who may create a rail but
  // not reorder one gets the rail at the bottom, which is the honest outcome of what they hold.
  it('makes the create alone for a viewer who may not reorder one', async () => {
    const store = createPlanStore(atlas())
    const held = { ...writes(() => Promise.resolve({ ok: true, value: withRail() })), reorderEpic: null }
    const made = await planGestures(PLAN_A, held, store).dropRail?.({ name: 'New epic' }, 0)
    await drained()
    expect(store.real(made ?? '')).toBe(NEW_RAIL)
    expect(held.createEpic).toHaveBeenCalledOnce()
  })

  it('writes nothing at all for a viewer who may not create one', async () => {
    const store = createPlanStore(atlas())
    const held = { ...writes(), createEpic: null }
    expect(planGestures(PLAN_A, held, store).dropRail).toBeNull()
    expect(held.reorderEpic).not.toHaveBeenCalled()
    expect(store.getSnapshot().saving).toBe(false)
  })
})
