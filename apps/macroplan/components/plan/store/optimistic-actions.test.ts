import { describe, expect, it, vi } from 'vitest'
import type { ActionResult } from '../../../actions/result'
import type { PlanEditActions } from '../edit-actions'
import { planScreenModel, type PlanScreenModel } from '../plan-screen-model'
import { atlasPlan, EPIC_1, FEATURE_1, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { addFeature } from './feature-edits'
import { addGroup } from './group-edits'
import { addItem } from './item-edits'
import { optimisticActions } from './optimistic-actions'
import { createPlanStore } from './plan-store'
import { addRail } from './rail-edits'

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

// The plan every write below is answered with: one of each kind of thing minted, each appended where the
// API appends it, so each create finds its own real id last in its own list.
const minted = (): PlanScreenModel => {
  const railed = addRail(atlas(), { name: 'New rail', colour: '#336699' }, 'REAL_E')
  const grouped = addGroup(railed, { name: 'New group' }, 'REAL_L')
  const featured = addFeature(grouped, { epicId: EPIC_1, name: 'New feature' }, 'REAL_F')
  return { ...addItem(featured, { featureId: FEATURE_1, name: 'New item' }, 'REAL_I'), updatedAt: '2026-09-30T00:00:00.000Z' }
}

const answering = () => harness(() => Promise.resolve<Answer>({ ok: true, value: minted() }))

const lastId = (plan: PlanScreenModel, list: 'epics' | 'labels' | 'features' | 'items'): string =>
  plan[list].at(-1)?.id ?? ''

const drained = async () => {
  for (let turn = 0; turn < 8; turn += 1) await tick()
}

describe('a write queued on something still being created is sent under the id it was created with', () => {
  it('renames a feature drawn a moment ago under the id its create was answered with', async () => {
    const { store, raw, writes } = answering()
    void writes.createFeature(PLAN_A, { epicId: EPIC_1, name: 'New feature' })
    const placeholder = lastId(store.getSnapshot().plan, 'features')
    void writes.renameFeature(PLAN_A, placeholder, 'Audit trail')
    await drained()
    expect(raw.renameFeature).toHaveBeenCalledWith(PLAN_A, 'REAL_F', 'Audit trail')
  })

  it('keeps the rename on screen across the answer, on the feature under its real id', async () => {
    const { store, raw, writes } = harness()
    let answer: (answered: Answer) => void = () => undefined
    vi.mocked(raw.createFeature).mockImplementation(() => new Promise<Answer>((resolve) => (answer = resolve)))
    void writes.createFeature(PLAN_A, { epicId: EPIC_1, name: 'New feature' })
    const placeholder = lastId(store.getSnapshot().plan, 'features')
    void writes.renameFeature(PLAN_A, placeholder, 'Audit trail')
    await tick()
    answer({ ok: true, value: minted() })
    await drained()
    const shown = store.getSnapshot().plan.features
    expect(shown.find((one) => one.id === 'REAL_F')?.name).toBe('Audit trail')
    expect(shown.some((one) => one.id === placeholder)).toBe(false)
  })

  it('resolves the ids inside a write too: a dependency list, a placement, a group, a parent', async () => {
    const { store, raw, writes } = answering()
    void writes.createEpic(PLAN_A, { name: 'New rail', colour: '#336699' })
    const rail = lastId(store.getSnapshot().plan, 'epics')
    void writes.createLabel(PLAN_A, { name: 'New group' })
    const group = lastId(store.getSnapshot().plan, 'labels')
    void writes.createFeature(PLAN_A, { epicId: EPIC_1, name: 'New feature' })
    const feature = lastId(store.getSnapshot().plan, 'features')
    void writes.setDependencies(PLAN_A, FEATURE_1, [feature])
    void writes.placeFeature(PLAN_A, FEATURE_1, { epicId: rail, position: 0 })
    void writes.labelFeature(PLAN_A, feature, group)
    void writes.placeItem(PLAN_A, ITEM_1, { featureId: feature, position: 0 })
    void writes.createItem(PLAN_A, { featureId: feature, name: 'Under it' })
    void writes.reorderEpic(PLAN_A, rail, 0)
    await drained()
    expect(raw.setDependencies).toHaveBeenCalledWith(PLAN_A, FEATURE_1, ['REAL_F'])
    expect(raw.placeFeature).toHaveBeenCalledWith(PLAN_A, FEATURE_1, { epicId: 'REAL_E', position: 0 })
    expect(raw.labelFeature).toHaveBeenCalledWith(PLAN_A, 'REAL_F', 'REAL_L')
    expect(raw.placeItem).toHaveBeenCalledWith(PLAN_A, ITEM_1, { featureId: 'REAL_F', position: 0 })
    expect(raw.createItem).toHaveBeenCalledWith(PLAN_A, { featureId: 'REAL_F', name: 'Under it' })
    expect(raw.reorderEpic).toHaveBeenCalledWith(PLAN_A, 'REAL_E', 0)
  })

  it('sends a write on something whose create was refused as it was made, for the API to refuse', async () => {
    const { store, raw, writes } = harness(() => Promise.resolve<Answer>({ ok: false, status: 422, detail: 'No.' }))
    void writes.createFeature(PLAN_A, { epicId: EPIC_1, name: 'New feature' })
    const placeholder = lastId(store.getSnapshot().plan, 'features')
    void writes.renameFeature(PLAN_A, placeholder, 'Audit trail')
    await drained()
    expect(raw.renameFeature).toHaveBeenCalledWith(PLAN_A, placeholder, 'Audit trail')
  })
})
