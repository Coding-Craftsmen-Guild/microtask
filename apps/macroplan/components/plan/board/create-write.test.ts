import type { NewEpic, Plan } from '@repo/api-client'
import { describe, expect, it, vi } from 'vitest'
import { atlasPlan, EPIC_1, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
import type { Draft } from '../canvas/extend-view'
import { CREATE_NAMES, DROPPED_ESTIMATE } from './create-kinds'
import { writeDrop, type CreateWrites } from './create-write'

const ADDED_RAIL = '01MPZZZZZZZZZZZZZZZZZZZZZ1'

const withRail = (): Plan => {
  const plan = atlasPlan()
  const last = plan.epics[0]
  if (last === undefined) throw new Error('the fixture holds no rail')
  return { ...plan, epics: [...plan.epics, { ...last, id: ADDED_RAIL, name: CREATE_NAMES.epic }] }
}

const doubles = () => ({
  createEpic: vi.fn<(planId: string, epic: NewEpic) => Promise<{ ok: true; value: Plan }>>(() =>
    Promise.resolve({ ok: true, value: withRail() }),
  ),
  createFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  createItem: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  labelFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  placeFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  placeItem: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  reorderEpic: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  setDependencies: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
})

const contextOf = (writes: CreateWrites) => ({ planId: PLAN_A, writes, colour: '#0e9f6e' })

const NOTHING: CreateWrites = {
  createEpic: null,
  createFeature: null,
  createItem: null,
  labelFeature: null,
  placeFeature: null,
  placeItem: null,
  reorderEpic: null,
  setDependencies: null,
}

const draft = (over: Partial<Draft> = {}): Draft => ({
  days: DROPPED_ESTIMATE,
  edge: 'none',
  epicId: EPIC_1,
  featureId: FEATURE_1,
  kind: 'feature',
  labelId: '',
  position: 0,
  sprint: 1,
  ...over,
})

describe('a dropped epic', () => {
  it('is created with the hue the server proposed, then moved to the gap the line was drawn at', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'epic', gap: 2 }, contextOf(writes))
    expect(writes.createEpic).toHaveBeenCalledWith(PLAN_A, {
      name: CREATE_NAMES.epic,
      colour: '#0e9f6e',
    })
    expect(writes.reorderEpic).toHaveBeenCalledWith(PLAN_A, ADDED_RAIL, 2)
  })

  // The create route appends, so the drop is two calls and says so. A viewer who may create a rail
  // but not reorder one gets the rail at the bottom, which is the honest outcome of what they hold.
  it('leaves a rail where the create put it for a viewer who may not reorder one', async () => {
    const writes = { ...doubles(), reorderEpic: null }
    await writeDrop({ kind: 'epic', gap: 2 }, contextOf(writes))
    expect(writes.createEpic).toHaveBeenCalledOnce()
  })

  it('writes nothing at all for a viewer who may not create one', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'epic', gap: 1 }, contextOf({ ...writes, createEpic: null }))
    expect(writes.reorderEpic).not.toHaveBeenCalled()
  })
})

// A rail dragged by its grip, which lands in the same gaps a new epic does and is one call rather than two:
// the rail already exists, so there is nothing to create.
describe('a rail moved to another gap', () => {
  it('is reordered to the gap the line was drawn at', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'rail', epicId: EPIC_1, gap: 2 }, contextOf(writes))
    expect(writes.reorderEpic).toHaveBeenCalledExactlyOnceWith(PLAN_A, EPIC_1, 2)
    expect(writes.createEpic).not.toHaveBeenCalled()
  })

  it('writes nothing for a viewer who may not reorder one', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'rail', epicId: EPIC_1, gap: 2 }, contextOf({ ...writes, reorderEpic: null }))
    expect(writes.createEpic).not.toHaveBeenCalled()
  })

  // A drag the root never saw a dragstart for, which is a drag from somewhere else entirely.
  it('writes nothing where the drag named no rail', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'rail', epicId: '', gap: 2 }, contextOf(writes))
    expect(writes.reorderEpic).not.toHaveBeenCalled()
  })
})

// Work dropped from the strip and work drawn from a mark's end are the same piece of work made two ways, so
// both end in `canvas/extend-write.ts`. What this file checks is the handover; that module's own test holds
// the five calls it makes.
describe('dropped work, which is the same write as drawn work', () => {
  it('lands on the rail it was dropped on, pinned to the sprint it was dropped in', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'work', draft: draft({ sprint: 3 }) }, contextOf(writes))
    expect(writes.createFeature).toHaveBeenCalledWith(PLAN_A, {
      epicId: EPIC_1,
      estimateDays: DROPPED_ESTIMATE,
      name: CREATE_NAMES.feature,
      pinSprint: 3,
    })
  })

  it('adds an item to the feature it was dropped inside, at the position it was dropped at', async () => {
    const writes = doubles()
    await writeDrop(
      { kind: 'work', draft: draft({ kind: 'item', position: 1, sprint: null }) },
      contextOf(writes),
    )
    expect(writes.createItem).toHaveBeenCalledWith(PLAN_A, {
      estimateDays: DROPPED_ESTIMATE,
      featureId: FEATURE_1,
      name: CREATE_NAMES.item,
    })
    expect(writes.createFeature).not.toHaveBeenCalled()
  })

  it('writes nothing for a viewer who may not create one', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'work', draft: draft() }, contextOf({ ...writes, createFeature: null }))
    expect(writes.placeFeature).not.toHaveBeenCalled()
  })
})

describe('a drop the aim refused', () => {
  it('writes nothing, even where every action is offered', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'none' }, contextOf(writes))
    expect(Object.values(writes).every((one) => one.mock.calls.length === 0)).toBe(true)
  })

  it('writes nothing where no action is offered either, rather than throwing', async () => {
    await expect(writeDrop({ kind: 'none' }, contextOf(NOTHING))).resolves.toBeUndefined()
  })
})
