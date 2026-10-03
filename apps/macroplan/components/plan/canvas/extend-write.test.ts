import type { Plan } from '@repo/api-client'
import { describe, expect, it, vi } from 'vitest'
import { atlasPlan, EPIC_1, FEATURE_1, FEATURE_2, ITEM_1, PLAN_A } from '../testing/plan-fixture'
import { DRAWN_NAMES, type Draft } from './extend-view'
import { mayExtend, writeDraw, type ExtendWrites } from './extend-write'
import { planScreenModel } from '../plan-screen-model'

const ADDED_FEATURE = '01MPZZZZZZZZZZZZZZZZZZZZZ8'

const ADDED_ITEM = '01MPZZZZZZZZZZZZZZZZZZZZZ9'

// What the API really answers: the plan with the new record appended, which is the only place its id
// exists. Everything downstream of a create reads it back from here.
const withFeature = (dependsOn: readonly string[] = []): Plan => {
  const plan = atlasPlan()
  const last = plan.features[0]
  if (last === undefined) throw new Error('the fixture holds no feature')
  return {
    ...plan,
    features: [...plan.features, { ...last, dependsOn, id: ADDED_FEATURE, name: DRAWN_NAMES.feature }],
  }
}

const withItem = (): Plan => {
  const plan = atlasPlan()
  const last = plan.items[0]
  if (last === undefined) throw new Error('the fixture holds no item')
  return { ...plan, items: [...plan.items, { ...last, id: ADDED_ITEM, name: DRAWN_NAMES.item }] }
}

const doubles = () => ({
  createFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(withFeature()) })),
  createItem: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(withItem()) })),
  labelFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
  placeFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
  placeItem: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
  setDependencies: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(atlasPlan()) })),
})

const NOTHING: ExtendWrites = {
  createFeature: null,
  createItem: null,
  labelFeature: null,
  placeFeature: null,
  placeItem: null,
  setDependencies: null,
}

const item = (over: Partial<Draft> = {}) => ({
  days: 2,
  edge: 'none' as const,
  epicId: EPIC_1,
  featureId: FEATURE_1,
  kind: 'item' as const,
  labelId: '',
  planId: PLAN_A,
  position: 1,
  sprint: null,
  ...over,
})

const feature = (over: Partial<Draft> = {}) => item({ kind: 'feature', ...over })

describe('whether a surface may draw at all', () => {
  it('may where either create is held, the two gestures making two different things', () => {
    expect(mayExtend({ ...NOTHING, createItem: doubles().createItem })).toBe(true)
    expect(mayExtend({ ...NOTHING, createFeature: doubles().createFeature })).toBe(true)
  })

  it('may not where neither is, which is what takes the handles off the board', () => {
    expect(mayExtend(NOTHING)).toBe(false)
  })
})

describe('an item drawn from the end of another', () => {
  it('is created in that feature at the drawn length, then moved to the drawn position', async () => {
    const writes = doubles()
    await writeDraw(item({ days: 2.5, position: 2 }), writes)

    expect(writes.createItem).toHaveBeenCalledExactlyOnceWith(PLAN_A, {
      estimateDays: 2.5,
      featureId: FEATURE_1,
      name: DRAWN_NAMES.item,
    })
    expect(writes.placeItem).toHaveBeenCalledExactlyOnceWith(PLAN_A, ADDED_ITEM, {
      featureId: FEATURE_1,
      position: 2,
    })
  })

  it('writes no dependency, an item having none of its own', async () => {
    const writes = doubles()
    await writeDraw(item(), writes)

    expect(writes.setDependencies).not.toHaveBeenCalled()
  })

  // The create route appends, so a reader who may create but not reorder gets the item at the end of
  // the feature. That is the honest outcome of what they hold rather than a refused gesture.
  it('leaves it where the create put it for a surface that may not reorder', async () => {
    const writes = { ...doubles(), placeItem: null }
    await writeDraw(item(), writes)

    expect(writes.createItem).toHaveBeenCalledOnce()
  })

  it('writes nothing at all for a surface that may not create one', async () => {
    const writes = doubles()
    await writeDraw(item(), { ...writes, createItem: null })

    expect(writes.placeItem).not.toHaveBeenCalled()
  })
})

describe('a feature drawn from the end of another', () => {
  it('is created on the rail at the drawn length, with the drawn sprint as its floor', async () => {
    const writes = doubles()
    await writeDraw(feature({ days: 3, sprint: 2 }), writes)

    expect(writes.createFeature).toHaveBeenCalledExactlyOnceWith(PLAN_A, {
      epicId: EPIC_1,
      estimateDays: 3,
      name: DRAWN_NAMES.feature,
      pinSprint: 2,
    })
  })

  it('is placed where it was drawn among the features of that rail', async () => {
    const writes = doubles()
    await writeDraw(feature({ position: 3 }), writes)

    expect(writes.placeFeature).toHaveBeenCalledExactlyOnceWith(PLAN_A, ADDED_FEATURE, {
      epicId: EPIC_1,
      position: 3,
    })
  })

  // Its own estimate and its one item are both the drawn length, so a feature drawn two days long reads
  // as planned 2d and broken down to 2d rather than as a discrepancy nobody authored.
  it('gets one item of the same length, which is what carries the estimate', async () => {
    const writes = doubles()
    await writeDraw(feature({ days: 2 }), writes)

    expect(writes.createItem).toHaveBeenCalledExactlyOnceWith(PLAN_A, {
      estimateDays: 2,
      featureId: ADDED_FEATURE,
      name: DRAWN_NAMES.item,
    })
  })

  it('joins the source’s group where it has one, and asks for none where it does not', async () => {
    const grouped = doubles()
    await writeDraw(feature({ labelId: 'phase-one' }), grouped)
    expect(grouped.labelFeature).toHaveBeenCalledExactlyOnceWith(PLAN_A, ADDED_FEATURE, 'phase-one')

    const plain = doubles()
    await writeDraw(feature(), plain)
    expect(plain.labelFeature).not.toHaveBeenCalled()
  })

  it('makes the new feature wait on the source, for a draw from an end', async () => {
    const writes = doubles()
    await writeDraw(feature({ edge: 'new-waits', featureId: FEATURE_2 }), writes)

    expect(writes.setDependencies).toHaveBeenCalledExactlyOnceWith(PLAN_A, ADDED_FEATURE, [FEATURE_2])
  })

  // The source keeps what it already waited on, the fixture's second feature waiting on its first: the
  // route replaces the whole set, so a draw that sent one id would delete every other edge it had.
  it('makes the source wait on the new feature, for a draw from a start', async () => {
    const writes = doubles()
    await writeDraw(feature({ edge: 'source-waits', featureId: FEATURE_2 }), writes)

    expect(writes.setDependencies).toHaveBeenCalledExactlyOnceWith(PLAN_A, FEATURE_2, [
      FEATURE_1,
      ADDED_FEATURE,
    ])
  })

  // `PUT …/dependencies` replaces the whole set, so the edges the answered plan holds have to be sent
  // with the new one or the draw would silently delete whatever the source already waited on.
  it('keeps the edges the answered plan already holds for the feature it writes', async () => {
    const writes = {
      ...doubles(),
      createFeature: vi.fn(() => Promise.resolve({ ok: true as const, value: planScreenModel(withFeature([ITEM_1])) })),
    }
    await writeDraw(feature({ edge: 'new-waits', featureId: FEATURE_2 }), writes)

    expect(writes.setDependencies).toHaveBeenCalledExactlyOnceWith(PLAN_A, ADDED_FEATURE, [
      ITEM_1,
      FEATURE_2,
    ])
  })

  it('writes no edge for a surface that may not set one, the feature still being created', async () => {
    const writes = { ...doubles(), setDependencies: null }
    await writeDraw(feature({ edge: 'new-waits' }), writes)

    expect(writes.createFeature).toHaveBeenCalledOnce()
  })

  it('writes nothing at all where the create answers something with no new feature in it', async () => {
    const writes = {
      ...doubles(),
      createFeature: vi.fn(() => Promise.resolve({ ok: false as const, status: 403, detail: 'no' })),
    }
    await writeDraw(feature({ edge: 'new-waits' }), writes)

    expect(writes.placeFeature).not.toHaveBeenCalled()
    expect(writes.createItem).not.toHaveBeenCalled()
    expect(writes.setDependencies).not.toHaveBeenCalled()
  })
})

describe('what the chain answers, which is what the store confirms', () => {
  it('answers the last write it made', async () => {
    const writes = doubles()
    const last = { ok: true as const, value: planScreenModel(atlasPlan({ name: 'After the edge' })) }
    writes.setDependencies.mockResolvedValueOnce(last)
    expect(await writeDraw(feature({ edge: 'new-waits' }), writes)).toBe(last)
  })

  it('tells confirm each plan it was answered with before a later step', async () => {
    const writes = doubles()
    const heard: string[] = []
    await writeDraw(item({ position: 2 }), writes, (plan) => heard.push(plan.items.at(-1)?.id ?? ''))
    expect(heard).toEqual([ADDED_ITEM])
  })

  it('stops at a refused step and answers the refusal, having confirmed what came before it', async () => {
    const writes = doubles()
    const refusal = { ok: false as const, status: 409, detail: 'Refused.' }
    writes.placeFeature.mockResolvedValueOnce(refusal as never)
    const heard: string[] = []
    const answer = await writeDraw(feature(), writes, (plan) => heard.push(plan.features.at(-1)?.id ?? ''))
    expect(answer).toBe(refusal)
    expect(heard).toEqual([ADDED_FEATURE])
    expect(writes.labelFeature).not.toHaveBeenCalled()
  })

  it('answers null where the surface may not create what was drawn', async () => {
    expect(await writeDraw(item(), { ...doubles(), createItem: null })).toBeNull()
  })

  // The store names the draw's placeholders from these, so a write made on the drawn work meanwhile goes
  // out under an id the API knows (`../store/plan-store.ts`).
  it('tells made the id of each thing a feature draw created, as each create is answered', async () => {
    const heard: string[] = []
    await writeDraw(feature(), doubles(), undefined, (kind, id) => heard.push(`${kind} ${id}`))
    expect(heard).toEqual([`feature ${ADDED_FEATURE}`, `item ${ADDED_ITEM}`])
  })

  it('tells made the id of the item an item draw created', async () => {
    const heard: string[] = []
    await writeDraw(item(), doubles(), undefined, (kind, id) => heard.push(`${kind} ${id}`))
    expect(heard).toEqual([`item ${ADDED_ITEM}`])
  })
})
