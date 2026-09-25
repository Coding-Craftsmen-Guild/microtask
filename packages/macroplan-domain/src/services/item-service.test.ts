import { describe, expect, it } from 'vitest'
import type { Lock } from '@repo/kernel'
import { Invalid, NotFound, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { PlanEpic } from '../entities/epic.js'
import type { PlanFeature } from '../entities/feature.js'
import type { PlanItem } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'
import { LIMITS } from '../limits.js'
import {
  RecordingPlanStore,
  countingLock,
  epic,
  feature,
  fixedClock,
  item,
  itemDocument,
  marked,
  planManifest,
  sequentialIds,
  STAMP,
} from '../testing/index.js'
import { ItemService } from './item-service.js'
import type { ItemRef, PlanRef } from './refs.js'

const NOW = '2026-09-23T12:00:00.000Z'
const PLAN = marked('PN', 1)
const RAIL = marked('EP', 1)
const HERE = marked('FT', 1)
const THERE = marked('FT', 2)
const NOWHERE = marked('FT', 9)
const ONE = marked('TM', 1)
const TWO = marked('TM', 2)
const THREE = marked('TM', 3)
const ELSEWHERE = marked('TM', 4)
const ABSENT = marked('TM', 999)
const NUL = String.fromCharCode(0)
const CR = String.fromCharCode(13)

const at: PlanRef = { product: 'macroplan', planId: PLAN }
const itemAt = (itemId: string): ItemRef => ({ ...at, itemId })

const build = (lock: Lock = new QueueLock()) => {
  const store = new RecordingPlanStore()
  const service = new ItemService({
    store,
    tokens: new ShareIndex(),
    lock,
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  return { store, service }
}

const rails: readonly PlanEpic[] = [epic(RAIL)]

const twoFeatures: readonly PlanFeature[] = [
  feature(HERE, RAIL, { name: 'Sign-up flow', position: 0 }),
  feature(THERE, RAIL, { name: 'Checkout flow', position: 1 }),
]

const threeItems: readonly PlanItem[] = [
  item(ONE, HERE, { name: 'One', position: 0 }),
  item(TWO, HERE, { name: 'Two', position: 1 }),
  item(THREE, HERE, { name: 'Three', position: 2 }),
]

const manyItems = (count: number): readonly PlanItem[] =>
  Array.from({ length: count }, (_, index) =>
    item(marked('TM', index + 1), HERE, { position: index }),
  )

const seed = async (
  store: RecordingPlanStore,
  overrides: Partial<PlanManifest> = {},
): Promise<void> => {
  await store.saveManifest(
    'macroplan',
    planManifest(PLAN, { epics: rails, features: twoFeatures, ...overrides }),
  )
  store.writes.length = 0
}

const under = (manifest: PlanManifest, featureId: string): readonly PlanItem[] =>
  [...manifest.items.filter((each) => each.featureId === featureId)].sort(
    (a, b) => a.position - b.position,
  )

const order = (manifest: PlanManifest, featureId: string): readonly string[] =>
  under(manifest, featureId).map((each) => each.id)

const spots = (manifest: PlanManifest, featureId: string): readonly number[] =>
  under(manifest, featureId).map((each) => each.position)

const pick = (manifest: PlanManifest, itemId: string): PlanItem => {
  const found = manifest.items.find((each) => each.id === itemId)
  if (found === undefined) throw new Error(`no item ${itemId}`)
  return found
}

const newest = (manifest: PlanManifest, featureId: string): PlanItem => {
  const group = under(manifest, featureId)
  const last = group.at(-1)
  if (last === undefined) throw new Error('no items')
  return last
}

describe('ItemService.add', () => {
  it('appends after the last item in its own feature', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.add(at, { featureId: HERE, name: 'Four' })
    expect(spots(next, HERE)).toEqual([0, 1, 2, 3])
    expect(newest(next, HERE).name).toBe('Four')
  })

  it('starts a feature that has no items at position 0', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.add(at, { featureId: THERE, name: 'First' })
    expect(spots(next, THERE)).toEqual([0])
  })

  it('counts only the items of its own feature, not the plan', async () => {
    const { service, store } = build()
    await seed(store, { items: [...threeItems, item(ELSEWHERE, THERE)] })
    const next = await service.add(at, { featureId: THERE, name: 'Second' })
    expect(spots(next, THERE)).toEqual([0, 1])
    expect(order(next, HERE)).toEqual([ONE, TWO, THREE])
  })

  it('stamps from the injected clock and takes its id from the ids generator', async () => {
    const { service, store } = build()
    await seed(store)
    const added = newest(await service.add(at, { featureId: HERE, name: 'One' }), HERE)
    expect(added.createdAt).toBe(NOW)
    expect(added.updatedAt).toBe(NOW)
    expect(added.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('links a new item to no Microtask task, which phase 4 alone may change', async () => {
    const { service, store } = build()
    await seed(store)
    expect(newest(await service.add(at, { featureId: HERE, name: 'One' }), HERE).linkedTaskId).toBeNull()
  })

  it('leaves the estimate null when none is given', async () => {
    const { service, store } = build()
    await seed(store)
    expect(newest(await service.add(at, { featureId: HERE, name: 'One' }), HERE).estimateDays).toBeNull()
  })

  it('takes an estimate of zero as a real answer rather than as absent', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, { featureId: HERE, name: 'One', estimateDays: 0 })
    expect(newest(next, HERE).estimateDays).toBe(0)
  })

  it('takes an explicit null estimate the same way as an absent one', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, { featureId: HERE, name: 'One', estimateDays: null })
    expect(newest(next, HERE).estimateDays).toBeNull()
  })

  it('writes the manifest alone, since a new item has no description to store', async () => {
    const { service, store } = build()
    await seed(store)
    await service.add(at, { featureId: HERE, name: 'One' })
    expect(store.methods()).toEqual(['saveManifest'])
  })

  it('refuses a feature that is not in this plan', async () => {
    const { service, store } = build()
    await seed(store)
    await expect(service.add(at, { featureId: NOWHERE, name: 'One' })).rejects.toThrow(Invalid)
  })

  it('succeeds one below the itemsPerPlan cap', async () => {
    const { service, store } = build()
    await seed(store, { items: manyItems(LIMITS.itemsPerPlan - 1) })
    await expect(service.add(at, { featureId: HERE, name: 'One' })).resolves.toBeDefined()
  })

  it('refuses to exceed the itemsPerPlan cap, naming the limit', async () => {
    const { service, store } = build()
    await seed(store, { items: manyItems(LIMITS.itemsPerPlan) })
    await expect(service.add(at, { featureId: HERE, name: 'One' })).rejects.toThrow(/items in this plan/)
  })

  it('rejects an unknown plan', async () => {
    const { service } = build()
    await expect(service.add(at, { featureId: HERE, name: 'One' })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store)
    await service.add(at, { featureId: HERE, name: 'One' })
    expect(runs()).toBe(1)
  })
})

describe('ItemService.update tells an absent key from null', () => {
  it('leaves the estimate alone when the key is absent', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.update(at, TWO, { name: 'Renamed' })
    expect(pick(next, TWO).estimateDays).toBe(1)
    expect(pick(next, TWO).name).toBe('Renamed')
  })

  it('clears the estimate when the key is null', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    expect(pick(await service.update(at, TWO, { estimateDays: null }), TWO).estimateDays).toBeNull()
  })

  it('sets the estimate when the key carries a number', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    expect(pick(await service.update(at, TWO, { estimateDays: 7 }), TWO).estimateDays).toBe(7)
  })

  it('sets an estimate of zero rather than reading it as a clear', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    expect(pick(await service.update(at, TWO, { estimateDays: 0 }), TWO).estimateDays).toBe(0)
  })

  it('leaves the name alone when only an estimate is given', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    expect(pick(await service.update(at, TWO, { estimateDays: 7 }), TWO).name).toBe('Two')
  })

  it('cleans a name it is given', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    expect(pick(await service.update(at, TWO, { name: '  a   b ' }), TWO).name).toBe('a b')
  })

  it('leaves the link to a Microtask task untouched', async () => {
    const { service, store } = build()
    const linked = [item(ONE, HERE, { linkedTaskId: marked('TK', 1) })]
    await seed(store, { items: linked })
    const next = await service.update(at, ONE, { name: 'Renamed', estimateDays: null })
    expect(pick(next, ONE).linkedTaskId).toBe(marked('TK', 1))
  })

  it('stamps the item and the plan, and moves nothing', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.update(at, TWO, { estimateDays: 7 })
    expect(pick(next, TWO).updatedAt).toBe(NOW)
    expect(pick(next, TWO).createdAt).toBe(STAMP)
    expect(next.updatedAt).toBe(NOW)
    expect(order(next, HERE)).toEqual([ONE, TWO, THREE])
  })

  it('leaves every sibling byte-identical', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.update(at, TWO, { estimateDays: 7 })
    expect(pick(next, ONE)).toEqual(threeItems[0])
    expect(pick(next, THREE)).toEqual(threeItems[2])
  })

  it('rejects an unknown item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(service.update(at, ABSENT, { name: 'X' })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { items: threeItems })
    await service.update(at, TWO, { estimateDays: 7 })
    expect(runs()).toBe(1)
  })
})

describe('ItemService.link', () => {
  it('stores the task id and stamps updatedAt', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.link(at, ONE, marked('TK', 1))
    expect(pick(next, ONE).linkedTaskId).toBe(marked('TK', 1))
    expect(pick(next, ONE).updatedAt).toBe(NOW)
    expect(next.updatedAt).toBe(NOW)
  })

  it('replaces an already-linked item rather than refusing a second link', async () => {
    const { service, store } = build()
    const linked = [item(ONE, HERE, { linkedTaskId: marked('TK', 1) })]
    await seed(store, { items: linked })
    const next = await service.link(at, ONE, marked('TK', 2))
    expect(pick(next, ONE).linkedTaskId).toBe(marked('TK', 2))
  })

  it('leaves every sibling byte-identical', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.link(at, ONE, marked('TK', 1))
    expect(pick(next, TWO)).toEqual(threeItems[1])
    expect(pick(next, THREE)).toEqual(threeItems[2])
  })

  it('succeeds on an item whose epic has no binding, since checking one needs Microtask and only apps/api can reach it', async () => {
    const { service, store } = build()
    await seed(store, { epics: rails, items: threeItems })
    const next = await service.link(at, ONE, marked('TK', 1))
    expect(pick(next, ONE).linkedTaskId).toBe(marked('TK', 1))
  })

  it('does not check that the task exists, for the same reason it does not check the binding', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.link(at, ONE, 'not-a-real-task-id-at-all')
    expect(pick(next, ONE).linkedTaskId).toBe('not-a-real-task-id-at-all')
  })

  it('rejects an unknown item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(service.link(at, ABSENT, marked('TK', 1))).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { items: threeItems })
    await service.link(at, ONE, marked('TK', 1))
    expect(runs()).toBe(1)
  })
})

describe('ItemService.unlink', () => {
  it('sets the link to null', async () => {
    const { service, store } = build()
    const linked = [item(ONE, HERE, { linkedTaskId: marked('TK', 1) })]
    await seed(store, { items: linked })
    const next = await service.unlink(at, ONE)
    expect(pick(next, ONE).linkedTaskId).toBeNull()
  })

  it('is idempotent on an already-unlinked item, not an error', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.unlink(at, ONE)
    expect(pick(next, ONE).linkedTaskId).toBeNull()
  })

  it('leaves every sibling byte-identical', async () => {
    const { service, store } = build()
    const linked = [item(ONE, HERE, { linkedTaskId: marked('TK', 1) }), threeItems[1] as PlanItem, threeItems[2] as PlanItem]
    await seed(store, { items: linked })
    const next = await service.unlink(at, ONE)
    expect(pick(next, TWO)).toEqual(threeItems[1])
    expect(pick(next, THREE)).toEqual(threeItems[2])
  })

  it('rejects an unknown item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(service.unlink(at, ABSENT)).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    const linked = [item(ONE, HERE, { linkedTaskId: marked('TK', 1) })]
    await seed(store, { items: linked })
    await service.unlink(at, ONE)
    expect(runs()).toBe(1)
  })
})

describe('ItemService.place', () => {
  it('moves the named item and leaves its siblings in the order they were in', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.place(at, ONE, { featureId: HERE, position: 2 })
    expect(order(next, HERE)).toEqual([TWO, THREE, ONE])
    expect(spots(next, HERE)).toEqual([0, 1, 2])
  })

  it('renumbers both groups densely when an item moves to another feature', async () => {
    const { service, store } = build()
    await seed(store, {
      items: [...threeItems, item(ELSEWHERE, THERE, { name: 'Other', position: 0 })],
    })
    const next = await service.place(at, TWO, { featureId: THERE, position: 0 })
    expect(order(next, HERE)).toEqual([ONE, THREE])
    expect(spots(next, HERE)).toEqual([0, 1])
    expect(order(next, THERE)).toEqual([TWO, ELSEWHERE])
    expect(spots(next, THERE)).toEqual([0, 1])
    expect(pick(next, TWO).featureId).toBe(THERE)
  })

  it('clamps a position past the end of the group it is joining', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    expect(order(await service.place(at, ONE, { featureId: HERE, position: 99 }), HERE)).toEqual([
      TWO,
      THREE,
      ONE,
    ])
  })

  it('moves nothing when the item is already where it is going', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.place(at, TWO, { featureId: HERE, position: 1 })
    expect(next.items).toEqual(threeItems)
  })

  it('refuses a feature that is not in this plan', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(
      service.place(at, ONE, { featureId: NOWHERE, position: 0 }),
    ).rejects.toThrow(Invalid)
  })

  it('rejects an unknown item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(
      service.place(at, ABSENT, { featureId: HERE, position: 0 }),
    ).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { items: threeItems })
    await service.place(at, ONE, { featureId: HERE, position: 2 })
    expect(runs()).toBe(1)
  })
})

describe('ItemService.remove', () => {
  it('removes the item and renumbers what is left of its group densely', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const next = await service.remove(at, TWO)
    expect(order(next, HERE)).toEqual([ONE, THREE])
    expect(spots(next, HERE)).toEqual([0, 1])
  })

  it('deletes the item file in one call, naming only that item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    store.putRawItem('macroplan', PLAN, TWO, JSON.stringify(itemDocument(TWO)))
    await service.remove(at, TWO)
    expect(store.deletes()).toHaveLength(1)
    expect(store.deletes()[0]?.itemIds).toEqual([TWO])
    expect(await store.readItem('macroplan', PLAN, TWO)).toBeNull()
  })

  it('rejects an absent item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(service.remove(at, ABSENT)).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { items: threeItems })
    await service.remove(at, TWO)
    expect(runs()).toBe(1)
  })
})

describe('ItemService.readOne', () => {
  it('answers the item beside the description its own file holds', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    store.putRawItem('macroplan', PLAN, ONE, JSON.stringify(itemDocument(ONE)))
    const read = await service.readOne(itemAt(ONE))
    expect(read.item).toEqual(threeItems[0])
    expect(read.description).toBe('Wire the form to the API')
  })

  it('answers an empty description when the file is not there', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const read = await service.readOne(itemAt(ONE))
    expect(read.description).toBe('')
    expect(read.item.id).toBe(ONE)
  })

  it('answers an empty description when the file will not decode, rather than throwing', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    store.putRawItem('macroplan', PLAN, ONE, 'not json at all')
    await expect(service.readOne(itemAt(ONE))).resolves.toMatchObject({ description: '' })
  })

  it('takes no lock, so a writer holding it may read', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { items: threeItems })
    await service.readOne(itemAt(ONE))
    expect(runs()).toBe(0)
  })

  it('rejects an unknown item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(service.readOne(itemAt(ABSENT))).rejects.toThrow(NotFound)
  })

  it('rejects an unknown plan', async () => {
    const { service } = build()
    await expect(service.readOne(itemAt(ONE))).rejects.toThrow(NotFound)
  })
})

describe('ItemService.writeDescription', () => {
  it('writes the item file before the manifest, in that order', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await service.writeDescription(itemAt(ONE), 'A note')
    expect(store.methods()).toEqual(['saveItem', 'saveManifest'])
  })

  it('stores what it wrote, so a read afterwards answers it', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await service.writeDescription(itemAt(ONE), 'A note')
    await expect(service.readOne(itemAt(ONE))).resolves.toMatchObject({ description: 'A note' })
  })

  it('runs cleanDescription over what it was given', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await service.writeDescription(itemAt(ONE), `one${NUL}${CR}two`)
    const read = await service.readOne(itemAt(ONE))
    expect(read.description).toBe(`one${String.fromCharCode(10)}two`)
    expect(read.description).not.toContain(NUL)
  })

  it('caps a description at the byte limit rather than storing it whole', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await service.writeDescription(itemAt(ONE), 'x'.repeat(20_000))
    const read = await service.readOne(itemAt(ONE))
    expect(read.description).toHaveLength(8_192)
  })

  it('answers the item it stamped, and stamps the plan too', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    const written = await service.writeDescription(itemAt(ONE), 'A note')
    expect(written.updatedAt).toBe(NOW)
    expect(written.createdAt).toBe(STAMP)
    const stored = await store.readManifest('macroplan', PLAN)
    expect(stored?.updatedAt).toBe(NOW)
  })

  it('keeps the createdAt the file already carried on a second write', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    store.putRawItem('macroplan', PLAN, ONE, JSON.stringify(itemDocument(ONE)))
    await service.writeDescription(itemAt(ONE), 'A second note')
    const file = await store.readItem('macroplan', PLAN, ONE)
    expect(file?.createdAt).toBe(STAMP)
    expect(file?.updatedAt).toBe(NOW)
  })

  it('moves nothing and changes no sibling', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await service.writeDescription(itemAt(ONE), 'A note')
    const stored = await store.readManifest('macroplan', PLAN)
    expect(stored?.items.filter((each) => each.id !== ONE)).toEqual([threeItems[1], threeItems[2]])
  })

  it('rejects an unknown item', async () => {
    const { service, store } = build()
    await seed(store, { items: threeItems })
    await expect(service.writeDescription(itemAt(ABSENT), 'A note')).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { items: threeItems })
    await service.writeDescription(itemAt(ONE), 'A note')
    expect(runs()).toBe(1)
  })
})
