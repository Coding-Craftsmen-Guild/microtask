import { describe, expect, it } from 'vitest'
import { ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import { schedule } from '@repo/schedule'
import type { PlanManifest } from '../entities/plan.js'
import {
  RecordingPlanStore,
  epic,
  feature,
  fixedClock,
  item,
  itemDocument,
  marked,
  planManifest,
  sequentialIds,
} from '../testing/index.js'
import { EpicService } from './epic-service.js'
import { FeatureService } from './feature-service.js'
import type { PlanRef } from './refs.js'

const NOW = '2026-09-23T12:00:00.000Z'
const PLAN = marked('PN', 1)
const TOP = marked('EP', 1)
const BOTTOM = marked('EP', 2)
const F1 = marked('FT', 1)
const F2 = marked('FT', 2)
const F3 = marked('FT', 3)
const G1 = marked('FT', 4)
const G2 = marked('FT', 5)
const I1 = marked('TM', 1)
const I2 = marked('TM', 2)
const I3 = marked('TM', 3)
const I4 = marked('TM', 4)

const at: PlanRef = { product: 'macroplan', planId: PLAN }

const epics = () => [epic(TOP, { railOrder: 0 }), epic(BOTTOM, { name: 'Billing', railOrder: 1 })]

/**
 * Two rails, five features and four items, with edges pointing at the feature in the middle.
 *
 * `F2` is the branch every case here deletes: it sits in the middle of the top rail, carries two
 * items, a pin and an estimate, and is named by both features on the other rail — so one delete has
 * to renumber a rail, strip edges from two features, and take two item files with it.
 */
const seeded = (): PlanManifest =>
  planManifest(PLAN, {
    epics: epics(),
    features: [
      feature(F1, TOP, { name: 'One', position: 0, estimateDays: 4 }),
      feature(F2, TOP, { name: 'Two', position: 1, estimateDays: 3, pinSprint: 2 }),
      feature(F3, TOP, { name: 'Three', position: 2, estimateDays: 5, dependsOn: [F1] }),
      feature(G1, BOTTOM, { name: 'Four', position: 0, estimateDays: 2, dependsOn: [F2] }),
      feature(G2, BOTTOM, { name: 'Five', position: 1, estimateDays: 6, dependsOn: [F2, F1] }),
    ],
    items: [
      item(I1, F2, { name: 'Item one', position: 0 }),
      item(I2, F2, { name: 'Item two', position: 1, estimateDays: 2 }),
      item(I3, F1, { name: 'Item three', position: 0 }),
      item(I4, G1, { name: 'Item four', position: 0 }),
    ],
  })

/**
 * The same plan as {@link seeded}, built from scratch with `F2` and its two items never in it.
 *
 * Written out rather than derived, because it is the comparison the whole suite rests on: a delete
 * must leave exactly the plan that was never built with that branch, and deriving the expectation
 * with the same helper the service uses would compare the implementation against itself.
 */
const withoutF2 = (): PlanManifest =>
  planManifest(PLAN, {
    epics: epics(),
    features: [
      feature(F1, TOP, { name: 'One', position: 0, estimateDays: 4 }),
      feature(F3, TOP, { name: 'Three', position: 1, estimateDays: 5, dependsOn: [F1] }),
      feature(G1, BOTTOM, { name: 'Four', position: 0, estimateDays: 2, dependsOn: [] }),
      feature(G2, BOTTOM, { name: 'Five', position: 1, estimateDays: 6, dependsOn: [F1] }),
    ],
    items: [
      item(I3, F1, { name: 'Item three', position: 0 }),
      item(I4, G1, { name: 'Item four', position: 0 }),
    ],
    updatedAt: NOW,
  })

/** The same plan with the whole top rail gone: two features left, one item, no edges at all. */
const withoutTop = (): PlanManifest =>
  planManifest(PLAN, {
    epics: [epic(BOTTOM, { name: 'Billing', railOrder: 0 })],
    features: [
      feature(G1, BOTTOM, { name: 'Four', position: 0, estimateDays: 2, dependsOn: [] }),
      feature(G2, BOTTOM, { name: 'Five', position: 1, estimateDays: 6, dependsOn: [] }),
    ],
    items: [item(I4, G1, { name: 'Item four', position: 0 })],
    updatedAt: NOW,
  })

const build = async () => {
  const store = new RecordingPlanStore()
  const ctx = {
    store,
    tokens: new ShareIndex(),
    lock: new QueueLock(),
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  }
  await store.saveManifest('macroplan', seeded())
  for (const id of [I1, I2, I3, I4]) {
    store.putRawItem('macroplan', PLAN, id, JSON.stringify(itemDocument(id)))
  }
  store.writes.length = 0
  return { store, epics: new EpicService(ctx), features: new FeatureService(ctx) }
}

const files = async (store: RecordingPlanStore): Promise<readonly string[]> => {
  const present: string[] = []
  for (const id of [I1, I2, I3, I4]) {
    const found = await store.readItem('macroplan', PLAN, id)
    if (found !== null) present.push(id)
  }
  return present
}

describe('deleting a feature takes its items with it', () => {
  it('drops its items from the manifest', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    expect(next.items.map((each) => each.id)).toEqual([I3, I4])
  })

  it('deletes their files in one deleteItems call, naming both', async () => {
    const { features, store } = await build()
    await features.remove(at, F2)
    expect(store.deletes()).toHaveLength(1)
    expect(store.deletes()[0]?.itemIds).toEqual([I1, I2])
  })

  it('writes the manifest once, through that one call', async () => {
    const { features, store } = await build()
    await features.remove(at, F2)
    expect(store.methods()).toEqual(['deleteItems', 'saveManifest'])
  })

  it('leaves the files of every item it did not delete', async () => {
    const { features, store } = await build()
    await features.remove(at, F2)
    expect(await files(store)).toEqual([I3, I4])
  })

  it('still makes one call when the feature had no items, so a delete is one write', async () => {
    const { features, store } = await build()
    await features.remove(at, F3)
    expect(store.deletes()).toHaveLength(1)
    expect(store.deletes()[0]?.itemIds).toEqual([])
  })
})

describe('deleting an epic takes its features and all their items with it', () => {
  it('drops every feature on the rail and every item under them', async () => {
    const { epics: service } = await build()
    const next = await service.remove(at, TOP)
    expect(next.features.map((each) => each.id)).toEqual([G1, G2])
    expect(next.items.map((each) => each.id)).toEqual([I4])
  })

  it('deletes three item files in one deleteItems call', async () => {
    const { epics: service, store } = await build()
    await service.remove(at, TOP)
    expect(store.deletes()).toHaveLength(1)
    expect(store.deletes()[0]?.itemIds).toEqual([I1, I2, I3])
    expect(await files(store)).toEqual([I4])
  })

  it('renumbers the rails that are left densely', async () => {
    const { epics: service } = await build()
    const next = await service.remove(at, TOP)
    expect(next.epics.map((each) => each.railOrder)).toEqual([0])
  })

  it('leaves exactly the plan that was never built with that rail', async () => {
    const { epics: service, store } = await build()
    await service.remove(at, TOP)
    expect(await store.readManifest('macroplan', PLAN)).toEqual(withoutTop())
  })
})

describe('deleting a feature strips its id from every edge that named it', () => {
  it('strips it on its own rail and on every other', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    const edges = next.features.map((each) => [each.id, [...each.dependsOn]] as const)
    expect(edges).toEqual([
      [F1, []],
      [F3, [F1]],
      [G1, []],
      [G2, [F1]],
    ])
  })

  it('leaves the edges that named something else, in the order they were in', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    expect(next.features.find((each) => each.id === G2)?.dependsOn).toEqual([F1])
  })

  it('names no removed feature anywhere in the plan afterwards', async () => {
    const { epics: service } = await build()
    const next = await service.remove(at, TOP)
    const named = next.features.flatMap((each) => [...each.dependsOn])
    expect(named.filter((id) => [F1, F2, F3].includes(id))).toEqual([])
  })
})

describe('the schedule after a delete is the schedule of a plan built without that branch', () => {
  it('agrees span for span with the plan that never had the feature', async () => {
    const { features, store } = await build()
    await features.remove(at, F2)
    const stored = await store.readManifest('macroplan', PLAN)
    expect(schedule(stored ?? withoutF2())).toEqual(schedule(withoutF2()))
  })

  it('agrees span for span with the plan that never had the rail', async () => {
    const { epics: service, store } = await build()
    await service.remove(at, TOP)
    const stored = await store.readManifest('macroplan', PLAN)
    expect(schedule(stored ?? withoutTop())).toEqual(schedule(withoutTop()))
  })

  it('reports no cycle and drops no edge, since nothing dangles', async () => {
    const { features, store } = await build()
    await features.remove(at, F2)
    const stored = await store.readManifest('macroplan', PLAN)
    const result = schedule(stored ?? withoutF2())
    expect(result.cycles).toEqual([])
    expect(result.ignoredEdges).toEqual([])
    expect(result.unscheduled).toEqual([])
    expect([...result.days.keys()].sort()).toEqual([F1, F3, G1, G2, I3, I4].sort())
  })
})

describe('nothing auto-moves when a feature is deleted from the middle of a rail', () => {
  it('leaves the whole manifest byte for byte the plan built without that branch', async () => {
    const { features, store } = await build()
    await features.remove(at, F2)
    expect(await store.readManifest('macroplan', PLAN)).toEqual(withoutF2())
  })

  it('keeps the relative order of the rail it renumbered', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    const rail = next.features.filter((each) => each.epicId === TOP)
    expect(rail.map((each) => each.id)).toEqual([F1, F3])
    expect(rail.map((each) => each.position)).toEqual([0, 1])
  })

  it('changes no estimate and no pin anywhere else in the plan', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    const kept = next.features.map((each) => [each.id, each.estimateDays, each.pinSprint] as const)
    expect(kept).toEqual([
      [F1, 4, null],
      [F3, 5, null],
      [G1, 2, null],
      [G2, 6, null],
    ])
  })

  it('stamps no surviving feature or item, since nobody edited them', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    const stamps = [...next.features, ...next.items].map((each) => each.updatedAt)
    expect(new Set(stamps)).toEqual(new Set([seeded().features[0]?.updatedAt]))
  })

  it('stamps the plan itself, which did change', async () => {
    const { features } = await build()
    expect((await features.remove(at, F2)).updatedAt).toBe(NOW)
  })

  it('leaves the item positions inside every untouched feature alone', async () => {
    const { features } = await build()
    const next = await features.remove(at, F2)
    expect(next.items).toEqual(withoutF2().items)
  })
})
