import { describe, expect, it, vi } from 'vitest'
import { EPIC_1, FEATURE_1, PLAN_A, atlasPlan } from '../testing/plan-fixture'
import type { Draft } from '../canvas/extend-view'
import { planScreenModel } from '../plan-screen-model'
import { CREATE_NAMES, DROPPED_ESTIMATE } from './create-kinds'
import { writeDrop, type CreateWrites } from './create-write'

const ADDED_RAIL = '01MPZZZZZZZZZZZZZZZZZZZZZ1'

const doubles = () => ({
  draw: vi.fn(() => Promise.resolve()),
  dropRail: vi.fn(() => Promise.resolve<string | null>(ADDED_RAIL)),
  reorderEpic: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
})

const contextOf = (writes: CreateWrites) => ({ planId: PLAN_A, writes, colour: '#0e9f6e' })

const NOTHING: CreateWrites = { draw: null, dropRail: null, reorderEpic: null }

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
  it('is the rail gesture, named for the strip, in the hue the server proposed, at the gap', async () => {
    const writes = doubles()
    expect(await writeDrop({ kind: 'epic', gap: 2 }, contextOf(writes))).toBe(ADDED_RAIL)
    expect(writes.dropRail).toHaveBeenCalledWith({ name: CREATE_NAMES.epic, colour: '#0e9f6e' }, 2)
  })

  it('writes nothing at all for a viewer who may not create one', async () => {
    await expect(writeDrop({ kind: 'epic', gap: 1 }, contextOf(NOTHING))).resolves.toBeNull()
  })
})

// A rail dragged by its grip, which lands in the same gaps a new epic does and is one write: the rail
// already exists, so there is nothing to create.
describe('a rail moved to another gap', () => {
  it('is reordered to the gap the line was drawn at', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'rail', epicId: EPIC_1, gap: 2 }, contextOf(writes))
    expect(writes.reorderEpic).toHaveBeenCalledExactlyOnceWith(PLAN_A, EPIC_1, 2)
    expect(writes.dropRail).not.toHaveBeenCalled()
  })

  it('writes nothing for a viewer who may not reorder one', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'rail', epicId: EPIC_1, gap: 2 }, contextOf({ ...writes, reorderEpic: null }))
    expect(writes.dropRail).not.toHaveBeenCalled()
  })

  // A drag the root never saw a dragstart for, which is a drag from somewhere else entirely.
  it('writes nothing where the drag named no rail', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'rail', epicId: '', gap: 2 }, contextOf(writes))
    expect(writes.reorderEpic).not.toHaveBeenCalled()
  })
})

// Work dropped from the strip and work drawn from a mark's end are the same piece of work made two ways, so
// both are the one draw gesture. What this file checks is the handover; `../store/gestures.ts` and
// `../canvas/extend-write.ts` hold what the gesture shows and the calls it makes.
describe('dropped work, which is the same gesture as drawn work', () => {
  it('hands the draft to the draw gesture as the aim worded it', async () => {
    const writes = doubles()
    const dropped = draft({ sprint: 3 })
    await writeDrop({ kind: 'work', draft: dropped }, contextOf(writes))
    expect(writes.draw).toHaveBeenCalledExactlyOnceWith(dropped)
  })

  it('writes nothing for a viewer who may not draw', async () => {
    await expect(writeDrop({ kind: 'work', draft: draft() }, contextOf(NOTHING))).resolves.toBeNull()
  })
})

describe('a drop the aim refused', () => {
  it('writes nothing, even where every write is offered', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'none' }, contextOf(writes))
    expect([writes.draw, writes.dropRail, writes.reorderEpic].every((one) => one.mock.calls.length === 0)).toBe(true)
  })

  it('writes nothing where no write is offered either, rather than throwing', async () => {
    await expect(writeDrop({ kind: 'none' }, contextOf(NOTHING))).resolves.toBeNull()
  })
})
