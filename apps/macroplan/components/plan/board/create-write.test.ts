import type { NewEpic, NewFeature, NewItem, Plan } from '@repo/api-client'
import { describe, expect, it, vi } from 'vitest'
import { atlasPlan, EPIC_1, FEATURE_1, PLAN_A } from '../testing/plan-fixture'
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
  reorderEpic: vi.fn(() => Promise.resolve({ ok: true as const, value: atlasPlan() })),
  createFeature: vi.fn<(planId: string, feature: NewFeature) => Promise<{ ok: true; value: Plan }>>(
    () => Promise.resolve({ ok: true, value: atlasPlan() }),
  ),
  createItem: vi.fn<(planId: string, item: NewItem) => Promise<{ ok: true; value: Plan }>>(() =>
    Promise.resolve({ ok: true, value: atlasPlan() }),
  ),
})

const contextOf = (writes: CreateWrites) => ({ planId: PLAN_A, writes, colour: '#0e9f6e' })

const NOTHING: CreateWrites = {
  createEpic: null,
  reorderEpic: null,
  createFeature: null,
  createItem: null,
}

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
    expect(writes.createEpic).not.toHaveBeenCalled()
    expect(writes.reorderEpic).not.toHaveBeenCalled()
  })
})

describe('a dropped feature', () => {
  // A pin is a **floor** and never a date, so pinning to the dropped sprint says exactly what the
  // gesture meant — not before here — and the schedule still has the last word about where it lands.
  it('lands on the rail it was dropped on, pinned to the sprint it was dropped in', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'feature', epicId: EPIC_1, sprint: 3 }, contextOf(writes))
    expect(writes.createFeature).toHaveBeenCalledWith(PLAN_A, {
      epicId: EPIC_1,
      name: CREATE_NAMES.feature,
      estimateDays: DROPPED_ESTIMATE,
      pinSprint: 3,
    })
  })

  // A feature with no estimate has no bar: it lands in the unscheduled tray, which is the one place a
  // reader who has just dropped something onto the board will not look for it.
  it('is given an estimate, so it has a bar rather than a row in the tray', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'feature', epicId: EPIC_1, sprint: 0 }, contextOf(writes))
    const sent = writes.createFeature.mock.calls[0]?.[1]
    expect(sent?.estimateDays).toBeGreaterThan(0)
  })

  it('writes nothing for a viewer who may not create one', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'feature', epicId: EPIC_1, sprint: 0 }, contextOf({ ...writes, createFeature: null }))
    expect(writes.createFeature).not.toHaveBeenCalled()
  })
})

describe('a dropped item', () => {
  it('is added to the feature it was dropped inside, at the end of that feature', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'item', featureId: FEATURE_1 }, contextOf(writes))
    expect(writes.createItem).toHaveBeenCalledWith(PLAN_A, {
      featureId: FEATURE_1,
      name: CREATE_NAMES.item,
      estimateDays: DROPPED_ESTIMATE,
    })
  })

  it('writes nothing for a viewer who may not create one', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'item', featureId: FEATURE_1 }, contextOf({ ...writes, createItem: null }))
    expect(writes.createItem).not.toHaveBeenCalled()
  })
})

// §6: "there is no packing algorithm and nothing is ever auto-moved". A drop with nowhere to land
// writes nothing at all rather than guessing at a nearest rail.
describe('a drop with nowhere to land', () => {
  it('writes nothing, even where every action is offered', async () => {
    const writes = doubles()
    await writeDrop({ kind: 'none' }, contextOf(writes))
    for (const call of Object.values(writes)) expect(call).not.toHaveBeenCalled()
  })

  it('writes nothing where no action is offered either, rather than throwing', async () => {
    await expect(writeDrop({ kind: 'none' }, contextOf(NOTHING))).resolves.toBeUndefined()
  })
})
