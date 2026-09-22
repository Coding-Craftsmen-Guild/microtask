import { describe, expect, it } from 'vitest'
import type { Lock } from '@repo/kernel'
import { Conflict, Invalid, NotFound, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { PlanEpic } from '../entities/epic.js'
import type { PlanFeature } from '../entities/feature.js'
import type { PlanManifest } from '../entities/plan.js'
import { LIMITS } from '../limits.js'
import {
  RecordingPlanStore,
  countingLock,
  epic,
  feature,
  fixedClock,
  marked,
  planManifest,
  sequentialIds,
  STAMP,
} from '../testing/index.js'
import { FeatureService } from './feature-service.js'
import type { PlanRef } from './refs.js'

const NOW = '2026-09-23T12:00:00.000Z'
const PLAN = marked('PN', 1)
const HERE = marked('EP', 1)
const THERE = marked('EP', 2)
const NOWHERE = marked('EP', 9)
const ONE = marked('FT', 1)
const TWO = marked('FT', 2)
const THREE = marked('FT', 3)
const OTHER = marked('FT', 4)
const ABSENT = marked('FT', 999)
const ANCHORS = [1, 2, 3, 4, 5].map((index) => marked('FA', index))

const at: PlanRef = { product: 'macroplan', planId: PLAN }

const build = (lock: Lock = new QueueLock()) => {
  const store = new RecordingPlanStore()
  const service = new FeatureService({
    store,
    tokens: new ShareIndex(),
    lock,
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  return { store, service }
}

const rails: readonly PlanEpic[] = [
  epic(HERE, { railOrder: 0 }),
  epic(THERE, { name: 'Billing', railOrder: 1 }),
]

const threeHere: readonly PlanFeature[] = [
  feature(ONE, HERE, { name: 'One', position: 0 }),
  feature(TWO, HERE, { name: 'Two', position: 1 }),
  feature(THREE, HERE, { name: 'Three', position: 2 }),
]

const manyHere = (count: number): readonly PlanFeature[] =>
  Array.from({ length: count }, (_, index) =>
    feature(marked('FT', index + 1), HERE, { position: index }),
  )

const anchorFeatures = (): readonly PlanFeature[] =>
  ANCHORS.map((id, index) => feature(id, THERE, { position: index }))

const filler = (edges: number): readonly PlanFeature[] => {
  const out: PlanFeature[] = []
  let left = edges
  while (left > 0) {
    const take = Math.min(ANCHORS.length, left)
    out.push(
      feature(marked('FX', out.length + 1), THERE, {
        position: ANCHORS.length + out.length,
        dependsOn: ANCHORS.slice(0, take),
      }),
    )
    left -= take
  }
  return out
}

const seed = async (
  store: RecordingPlanStore,
  overrides: Partial<PlanManifest> = {},
): Promise<void> => {
  await store.saveManifest('macroplan', planManifest(PLAN, { epics: rails, ...overrides }))
  store.writes.length = 0
}

const on = (manifest: PlanManifest, epicId: string): readonly PlanFeature[] =>
  [...manifest.features.filter((each) => each.epicId === epicId)].sort(
    (a, b) => a.position - b.position,
  )

const order = (manifest: PlanManifest, epicId: string): readonly string[] =>
  on(manifest, epicId).map((each) => each.id)

const spots = (manifest: PlanManifest, epicId: string): readonly number[] =>
  on(manifest, epicId).map((each) => each.position)

const pick = (manifest: PlanManifest, featureId: string): PlanFeature => {
  const found = manifest.features.find((each) => each.id === featureId)
  if (found === undefined) throw new Error(`no feature ${featureId}`)
  return found
}

const newest = (manifest: PlanManifest, epicId: string): PlanFeature => {
  const last = on(manifest, epicId).at(-1)
  if (last === undefined) throw new Error('no features')
  return last
}

const edgeCount = (manifest: PlanManifest): number =>
  manifest.features.reduce((sum, each) => sum + each.dependsOn.length, 0)

describe('FeatureService.add', () => {
  it('appends after the last feature on its own rail', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.add(at, { epicId: HERE, name: 'Four' })
    expect(spots(next, HERE)).toEqual([0, 1, 2, 3])
    expect(newest(next, HERE).name).toBe('Four')
  })

  it('starts a rail that carries no features at position 0', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    expect(spots(await service.add(at, { epicId: THERE, name: 'First' }), THERE)).toEqual([0])
  })

  it('counts only the features on its own rail, not the plan', async () => {
    const { service, store } = build()
    await seed(store, { features: [...threeHere, feature(OTHER, THERE, { position: 0 })] })
    const next = await service.add(at, { epicId: THERE, name: 'Second' })
    expect(spots(next, THERE)).toEqual([0, 1])
    expect(order(next, HERE)).toEqual([ONE, TWO, THREE])
  })

  it('stamps from the injected clock and takes its id from the ids generator', async () => {
    const { service, store } = build()
    await seed(store)
    const added = newest(await service.add(at, { epicId: HERE, name: 'One' }), HERE)
    expect(added.createdAt).toBe(NOW)
    expect(added.updatedAt).toBe(NOW)
    expect(added.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('starts with no estimate, no pin and no dependencies', async () => {
    const { service, store } = build()
    await seed(store)
    const added = newest(await service.add(at, { epicId: HERE, name: 'One' }), HERE)
    expect(added.estimateDays).toBeNull()
    expect(added.pinSprint).toBeNull()
    expect(added.dependsOn).toEqual([])
  })

  it('takes an estimate and a pin when it is given them, zero included', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, { epicId: HERE, name: 'One', estimateDays: 0, pinSprint: 0 })
    expect(newest(next, HERE).estimateDays).toBe(0)
    expect(newest(next, HERE).pinSprint).toBe(0)
  })

  it('reads an explicit null the way it reads an absent key', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, {
      epicId: HERE,
      name: 'One',
      estimateDays: null,
      pinSprint: null,
    })
    expect(newest(next, HERE).estimateDays).toBeNull()
    expect(newest(next, HERE).pinSprint).toBeNull()
  })

  it('refuses a rail that is not in this plan', async () => {
    const { service, store } = build()
    await seed(store)
    await expect(service.add(at, { epicId: NOWHERE, name: 'One' })).rejects.toThrow(Invalid)
  })

  it('succeeds one below the featuresPerPlan cap', async () => {
    const { service, store } = build()
    await seed(store, { features: manyHere(LIMITS.featuresPerPlan - 1) })
    await expect(service.add(at, { epicId: HERE, name: 'One' })).resolves.toBeDefined()
  })

  it('refuses to exceed the featuresPerPlan cap, naming the limit', async () => {
    const { service, store } = build()
    await seed(store, { features: manyHere(LIMITS.featuresPerPlan) })
    await expect(service.add(at, { epicId: HERE, name: 'One' })).rejects.toThrow(
      /features in this plan/,
    )
  })

  it('rejects an unknown plan', async () => {
    const { service } = build()
    await expect(service.add(at, { epicId: HERE, name: 'One' })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store)
    await service.add(at, { epicId: HERE, name: 'One' })
    expect(runs()).toBe(1)
  })
})

describe('FeatureService.update tells an absent key from null', () => {
  it('leaves the estimate alone when the key is absent', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.update(at, TWO, { name: 'Renamed' })
    expect(pick(next, TWO).estimateDays).toBe(3)
  })

  it('clears the estimate when the key is null', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    expect(pick(await service.update(at, TWO, { estimateDays: null }), TWO).estimateDays).toBeNull()
  })

  it('sets the estimate when the key carries a number', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    expect(pick(await service.update(at, TWO, { estimateDays: 9 }), TWO).estimateDays).toBe(9)
  })

  it('sets an estimate of zero rather than reading it as a clear', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    expect(pick(await service.update(at, TWO, { estimateDays: 0 }), TWO).estimateDays).toBe(0)
  })

  it('leaves the pin alone when the key is absent', async () => {
    const { service, store } = build()
    await seed(store, { features: [feature(ONE, HERE, { pinSprint: 4 })] })
    expect(pick(await service.update(at, ONE, { estimateDays: 9 }), ONE).pinSprint).toBe(4)
  })

  it('clears the pin when the key is null', async () => {
    const { service, store } = build()
    await seed(store, { features: [feature(ONE, HERE, { pinSprint: 4 })] })
    expect(pick(await service.update(at, ONE, { pinSprint: null }), ONE).pinSprint).toBeNull()
  })

  it('sets the pin when the key carries a number, sprint zero included', async () => {
    const { service, store } = build()
    await seed(store, { features: [feature(ONE, HERE, { pinSprint: 4 })] })
    expect(pick(await service.update(at, ONE, { pinSprint: 0 }), ONE).pinSprint).toBe(0)
  })

  it('leaves the dependencies alone, which only setDependencies replaces', async () => {
    const { service, store } = build()
    await seed(store, { features: [feature(ONE, HERE), feature(TWO, HERE, { dependsOn: [ONE] })] })
    expect(pick(await service.update(at, TWO, { estimateDays: 9 }), TWO).dependsOn).toEqual([ONE])
  })

  it('stamps the feature and the plan, and moves nothing', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.update(at, TWO, { estimateDays: 9 })
    expect(pick(next, TWO).updatedAt).toBe(NOW)
    expect(pick(next, TWO).createdAt).toBe(STAMP)
    expect(next.updatedAt).toBe(NOW)
    expect(order(next, HERE)).toEqual([ONE, TWO, THREE])
  })

  it('leaves every sibling byte-identical', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.update(at, TWO, { estimateDays: 9 })
    expect(pick(next, ONE)).toEqual(threeHere[0])
    expect(pick(next, THREE)).toEqual(threeHere[2])
  })

  it('rejects an unknown feature', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.update(at, ABSENT, { name: 'X' })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { features: threeHere })
    await service.update(at, TWO, { estimateDays: 9 })
    expect(runs()).toBe(1)
  })
})

describe('FeatureService.place', () => {
  it('moves the named feature and leaves its siblings in the order they were in', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.place(at, ONE, { epicId: HERE, position: 2 })
    expect(order(next, HERE)).toEqual([TWO, THREE, ONE])
    expect(spots(next, HERE)).toEqual([0, 1, 2])
  })

  it('renumbers both rails densely when a feature moves to another one', async () => {
    const { service, store } = build()
    await seed(store, { features: [...threeHere, feature(OTHER, THERE, { position: 0 })] })
    const next = await service.place(at, TWO, { epicId: THERE, position: 0 })
    expect(order(next, HERE)).toEqual([ONE, THREE])
    expect(spots(next, HERE)).toEqual([0, 1])
    expect(order(next, THERE)).toEqual([TWO, OTHER])
    expect(spots(next, THERE)).toEqual([0, 1])
    expect(pick(next, TWO).epicId).toBe(THERE)
  })

  it('carries the estimate, the pin and the edges across a move untouched', async () => {
    const { service, store } = build()
    const moving = feature(TWO, HERE, { position: 1, pinSprint: 3, dependsOn: [ONE] })
    await seed(store, { features: [feature(ONE, HERE, { position: 0 }), moving] })
    const next = await service.place(at, TWO, { epicId: THERE, position: 0 })
    expect(pick(next, TWO)).toEqual({ ...moving, epicId: THERE, position: 0 })
  })

  it('stamps the plan and nothing inside it, since a position is the plan arrangement', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.place(at, ONE, { epicId: HERE, position: 2 })
    expect(next.updatedAt).toBe(NOW)
    expect(next.features.map((each) => each.updatedAt)).toEqual([STAMP, STAMP, STAMP])
  })

  it('clamps a position past the end of the rail it is joining', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    expect(order(await service.place(at, ONE, { epicId: HERE, position: 99 }), HERE)).toEqual([
      TWO,
      THREE,
      ONE,
    ])
  })

  it('moves nothing when the feature is already where it is going', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.place(at, TWO, { epicId: HERE, position: 1 })
    expect(next.features).toEqual(threeHere)
  })

  it('refuses a rail that is not in this plan', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.place(at, ONE, { epicId: NOWHERE, position: 0 })).rejects.toThrow(Invalid)
  })

  it('rejects an unknown feature', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.place(at, ABSENT, { epicId: HERE, position: 0 })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { features: threeHere })
    await service.place(at, ONE, { epicId: HERE, position: 2 })
    expect(runs()).toBe(1)
  })
})

describe('FeatureService.setDependencies', () => {
  it('stores the edges it was given', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.setDependencies(at, THREE, [ONE, TWO])
    expect(pick(next, THREE).dependsOn).toEqual([ONE, TWO])
  })

  it('replaces the list rather than adding to it, and an empty list clears it', async () => {
    const { service, store } = build()
    await seed(store, { features: [...threeHere.slice(0, 2), feature(THREE, HERE, { position: 2, dependsOn: [ONE] })] })
    expect(pick(await service.setDependencies(at, THREE, [TWO]), THREE).dependsOn).toEqual([TWO])
    expect(pick(await service.setDependencies(at, THREE, []), THREE).dependsOn).toEqual([])
  })

  it('stores a duplicated id once', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.setDependencies(at, THREE, [ONE, TWO, ONE, ONE])
    expect(pick(next, THREE).dependsOn).toEqual([ONE, TWO])
  })

  it('stamps the feature and the plan, and moves nothing', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.setDependencies(at, THREE, [ONE])
    expect(pick(next, THREE).updatedAt).toBe(NOW)
    expect(next.updatedAt).toBe(NOW)
    expect(order(next, HERE)).toEqual([ONE, TWO, THREE])
    expect(pick(next, ONE)).toEqual(threeHere[0])
  })

  it('refuses a self-edge', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.setDependencies(at, THREE, [THREE])).rejects.toThrow(Invalid)
  })

  it('refuses an id naming no feature in this plan', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.setDependencies(at, THREE, [ONE, ABSENT])).rejects.toThrow(Invalid)
  })

  it('names the id it refused, so a caller can tell which one it was', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.setDependencies(at, THREE, [ABSENT])).rejects.toThrow(
      new RegExp(ABSENT),
    )
  })

  it('rejects an unknown feature', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.setDependencies(at, ABSENT, [ONE])).rejects.toThrow(NotFound)
  })

  it('writes nothing when it refuses an unknown id', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const before = await store.readManifest('macroplan', PLAN)
    await expect(service.setDependencies(at, THREE, [ABSENT])).rejects.toThrow(Invalid)
    expect(await store.readManifest('macroplan', PLAN)).toEqual(before)
    expect(store.methods()).toEqual([])
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { features: threeHere })
    await service.setDependencies(at, THREE, [ONE])
    expect(runs()).toBe(1)
  })
})

describe('FeatureService.setDependencies refuses a cycle at the write', () => {
  const pair = (): readonly PlanFeature[] => [
    feature(ONE, HERE, { position: 0, dependsOn: [TWO] }),
    feature(TWO, HERE, { position: 1 }),
  ]

  it('throws Conflict for a two-feature cycle', async () => {
    const { service, store } = build()
    await seed(store, { features: pair() })
    await expect(service.setDependencies(at, TWO, [ONE])).rejects.toThrow(Conflict)
  })

  it('names both feature ids in the message', async () => {
    const { service, store } = build()
    await seed(store, { features: pair() })
    await expect(service.setDependencies(at, TWO, [ONE])).rejects.toThrow(new RegExp(ONE))
    await expect(service.setDependencies(at, TWO, [ONE])).rejects.toThrow(new RegExp(TWO))
  })

  it('writes nothing at all, so the manifest read afterwards is unchanged', async () => {
    const { service, store } = build()
    await seed(store, { features: pair() })
    const before = await store.readManifest('macroplan', PLAN)
    await expect(service.setDependencies(at, TWO, [ONE])).rejects.toThrow(Conflict)
    expect(await store.readManifest('macroplan', PLAN)).toEqual(before)
    expect(store.methods()).toEqual([])
  })

  it('refuses a three-feature cycle the same way', async () => {
    const { service, store } = build()
    await seed(store, {
      features: [
        feature(ONE, HERE, { position: 0, dependsOn: [TWO] }),
        feature(TWO, HERE, { position: 1, dependsOn: [THREE] }),
        feature(THREE, HERE, { position: 2 }),
      ],
    })
    await expect(service.setDependencies(at, THREE, [ONE])).rejects.toThrow(Conflict)
  })

  it('allows a diamond, which is not a cycle', async () => {
    const { service, store } = build()
    await seed(store, {
      features: [
        feature(ONE, HERE, { position: 0 }),
        feature(TWO, HERE, { position: 1, dependsOn: [ONE] }),
        feature(THREE, HERE, { position: 2, dependsOn: [ONE] }),
        feature(OTHER, THERE, { position: 0 }),
      ],
    })
    const next = await service.setDependencies(at, OTHER, [TWO, THREE])
    expect(pick(next, OTHER).dependsOn).toEqual([TWO, THREE])
  })
})

describe('FeatureService.setDependencies counts edges across the whole manifest', () => {
  const atCap = (edges: number): readonly PlanFeature[] => [
    ...anchorFeatures(),
    ...filler(edges),
    feature(ONE, HERE, { position: 0, dependsOn: [ANCHORS[0] ?? ''] }),
  ]

  it('accepts the edge that brings the plan exactly to the cap', async () => {
    const { service, store } = build()
    await seed(store, { features: atCap(LIMITS.edgesPerPlan - 2) })
    const next = await service.setDependencies(at, ONE, [ANCHORS[0] ?? '', ANCHORS[1] ?? ''])
    expect(edgeCount(next)).toBe(LIMITS.edgesPerPlan)
  })

  it('refuses the edge that would take the plan one past the cap', async () => {
    const { service, store } = build()
    await seed(store, { features: atCap(LIMITS.edgesPerPlan - 2) })
    await expect(
      service.setDependencies(at, ONE, [ANCHORS[0] ?? '', ANCHORS[1] ?? '', ANCHORS[2] ?? '']),
    ).rejects.toThrow(/dependency edges in this plan/)
  })

  it('subtracts the edges it is replacing, so a plan at the cap can still be edited', async () => {
    const { service, store } = build()
    await seed(store, { features: atCap(LIMITS.edgesPerPlan - 1) })
    const next = await service.setDependencies(at, ONE, [ANCHORS[1] ?? ''])
    expect(edgeCount(next)).toBe(LIMITS.edgesPerPlan)
    expect(pick(next, ONE).dependsOn).toEqual([ANCHORS[1]])
  })

  it('counts a duplicate once, so a list of repeats is not a budget overrun', async () => {
    const { service, store } = build()
    await seed(store, { features: atCap(LIMITS.edgesPerPlan - 2) })
    const repeated = [ANCHORS[0] ?? '', ANCHORS[0] ?? '', ANCHORS[0] ?? '', ANCHORS[1] ?? '']
    await expect(service.setDependencies(at, ONE, repeated)).resolves.toBeDefined()
  })

  it('writes nothing when it refuses the budget', async () => {
    const { service, store } = build()
    await seed(store, { features: atCap(LIMITS.edgesPerPlan - 2) })
    const before = await store.readManifest('macroplan', PLAN)
    await expect(
      service.setDependencies(at, ONE, [ANCHORS[0] ?? '', ANCHORS[1] ?? '', ANCHORS[2] ?? '']),
    ).rejects.toThrow(Invalid)
    expect(await store.readManifest('macroplan', PLAN)).toEqual(before)
  })
})

describe('FeatureService.remove', () => {
  it('removes the feature and renumbers what is left of its rail densely', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    const next = await service.remove(at, TWO)
    expect(order(next, HERE)).toEqual([ONE, THREE])
    expect(spots(next, HERE)).toEqual([0, 1])
  })

  it('rejects an absent feature', async () => {
    const { service, store } = build()
    await seed(store, { features: threeHere })
    await expect(service.remove(at, ABSENT)).rejects.toThrow(NotFound)
  })

  it('rejects an unknown plan', async () => {
    const { service } = build()
    await expect(service.remove(at, ONE)).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { features: threeHere })
    await service.remove(at, TWO)
    expect(runs()).toBe(1)
  })
})
