import { describe, expect, it } from 'vitest'
import type { Lock } from '@repo/kernel'
import { Invalid, NotFound, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { PlanEpic } from '../entities/epic.js'
import type { PlanManifest } from '../entities/plan.js'
import { LIMITS } from '../limits.js'
import {
  MemoryPlanStore,
  countingLock,
  epic,
  feature,
  fixedClock,
  marked,
  planManifest,
  sequentialIds,
  STAMP,
} from '../testing/index.js'
import { EpicService } from './epic-service.js'
import type { PlanRef } from './refs.js'

const NOW = '2026-09-23T12:00:00.000Z'
const PLAN = marked('PN', 1)
const ABSENT = marked('EP', 999)
const FIRST = marked('EP', 1)
const SECOND = marked('EP', 2)
const THIRD = marked('EP', 3)

const BINDING = {
  projectId: marked('PJ', 1),
  role: 'view' as const,
  sealedToken: 'sealed.opaque.bytes',
}

const at: PlanRef = { product: 'macroplan', planId: PLAN }

const build = (lock: Lock = new QueueLock()) => {
  const store = new MemoryPlanStore()
  const service = new EpicService({
    store,
    tokens: new ShareIndex(),
    lock,
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  return { store, service }
}

const seed = async (
  store: MemoryPlanStore,
  overrides: Partial<PlanManifest> = {},
): Promise<void> => {
  await store.saveManifest('macroplan', planManifest(PLAN, overrides))
}

const threeRails = (): readonly PlanEpic[] => [
  epic(FIRST, { name: 'Discovery', railOrder: 0 }),
  epic(SECOND, { name: 'Checkout', railOrder: 1 }),
  epic(THIRD, { name: 'Billing', railOrder: 2 }),
]

const manyRails = (count: number): readonly PlanEpic[] =>
  Array.from({ length: count }, (_, index) => epic(marked('EP', index + 1), { railOrder: index }))

const railsOf = (manifest: PlanManifest): readonly string[] =>
  [...manifest.epics].sort((a, b) => a.railOrder - b.railOrder).map((each) => each.id)

const ordersOf = (manifest: PlanManifest): readonly number[] =>
  [...manifest.epics].sort((a, b) => a.railOrder - b.railOrder).map((each) => each.railOrder)

const pick = (manifest: PlanManifest, epicId: string): PlanEpic => {
  const found = manifest.epics.find((each) => each.id === epicId)
  if (found === undefined) throw new Error(`no epic ${epicId}`)
  return found
}

const added = (manifest: PlanManifest): PlanEpic => {
  const last = railsOf(manifest).at(-1)
  return pick(manifest, last ?? '')
}

describe('EpicService.add', () => {
  it('puts a new epic at the bottom rail, after the last sibling', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.add(at, { name: 'Growth' })
    expect(ordersOf(next)).toEqual([0, 1, 2, 3])
    expect(added(next).name).toBe('Growth')
    expect(added(next).railOrder).toBe(3)
  })

  it('puts the first epic of an empty plan at rail order 0', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, { name: 'Discovery' })
    expect(next.epics).toHaveLength(1)
    expect(next.epics[0]?.railOrder).toBe(0)
  })

  it('stamps from the injected clock and takes its id from the ids generator', async () => {
    const { service, store } = build()
    await seed(store)
    const only = (await service.add(at, { name: 'Discovery' })).epics[0]
    expect(only?.createdAt).toBe(NOW)
    expect(only?.updatedAt).toBe(NOW)
    expect(only?.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
  })

  it('bumps the plan updatedAt, since the plan changed', async () => {
    const { service, store } = build()
    await seed(store)
    expect((await service.add(at, { name: 'Discovery' })).updatedAt).toBe(NOW)
  })

  it('binds a new epic to nothing, which phase 4 alone may change', async () => {
    const { service, store } = build()
    await seed(store)
    expect((await service.add(at, { name: 'Discovery' })).epics[0]?.binding).toBeNull()
  })

  it('cleans the name it was given', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, { name: '   Discovery   and   more  ' })
    expect(next.epics[0]?.name).toBe('Discovery and more')
  })

  it('takes the colour it was given', async () => {
    const { service, store } = build()
    await seed(store)
    const next = await service.add(at, { name: 'D', colour: '#1f2a37' })
    expect(next.epics[0]?.colour).toBe('#1f2a37')
  })

  it('applies one default colour when none is given', async () => {
    const { service, store } = build()
    await seed(store)
    expect((await service.add(at, { name: 'D' })).epics[0]?.colour).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('succeeds one below the epicsPerPlan cap', async () => {
    const { service, store } = build()
    await seed(store, { epics: manyRails(LIMITS.epicsPerPlan - 1) })
    await expect(service.add(at, { name: 'Growth' })).resolves.toBeDefined()
  })

  it('refuses to exceed the epicsPerPlan cap, naming the limit', async () => {
    const { service, store } = build()
    await seed(store, { epics: manyRails(LIMITS.epicsPerPlan) })
    await expect(service.add(at, { name: 'Growth' })).rejects.toThrow(Invalid)
    await expect(service.add(at, { name: 'Growth' })).rejects.toThrow(/epics in this plan/)
  })

  it('rejects an unknown plan', async () => {
    const { service } = build()
    await expect(service.add(at, { name: 'Growth' })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store)
    await service.add(at, { name: 'Discovery' })
    expect(runs()).toBe(1)
  })
})

describe('EpicService.update tells an absent key from a value', () => {
  it('leaves the colour alone when only a name is given', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, SECOND, { name: 'Payments' })
    expect(pick(next, SECOND).name).toBe('Payments')
    expect(pick(next, SECOND).colour).toBe(epic(SECOND).colour)
  })

  it('leaves the name alone when only a colour is given', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, SECOND, { colour: '#1f2a37' })
    expect(pick(next, SECOND).colour).toBe('#1f2a37')
    expect(pick(next, SECOND).name).toBe('Checkout')
  })

  it('sets both when both are given', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, SECOND, { name: 'Payments', colour: '#1f2a37' })
    expect(pick(next, SECOND)).toMatchObject({ name: 'Payments', colour: '#1f2a37' })
  })

  it('changes nothing but the stamp when given no key at all', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, SECOND, {})
    expect(pick(next, SECOND)).toEqual({
      ...epic(SECOND, { name: 'Checkout', railOrder: 1 }),
      updatedAt: NOW,
    })
  })

  it('stamps the epic and the plan as changed, leaving createdAt alone', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, FIRST, { name: 'Research' })
    expect(pick(next, FIRST).updatedAt).toBe(NOW)
    expect(pick(next, FIRST).createdAt).toBe(STAMP)
    expect(next.updatedAt).toBe(NOW)
  })

  it('leaves every sibling byte-identical', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, FIRST, { name: 'Research' })
    expect(pick(next, SECOND)).toEqual(epic(SECOND, { name: 'Checkout', railOrder: 1 }))
    expect(pick(next, THIRD)).toEqual(epic(THIRD, { name: 'Billing', railOrder: 2 }))
  })

  it('never moves the rail it edits', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.update(at, THIRD, { name: 'Invoicing' })
    expect(railsOf(next)).toEqual([FIRST, SECOND, THIRD])
  })

  it('rejects an unknown epic', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    await expect(service.update(at, ABSENT, { name: 'X' })).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { epics: threeRails() })
    await service.update(at, FIRST, { name: 'Research' })
    expect(runs()).toBe(1)
  })
})

describe('EpicService leaves a binding untouchable', () => {
  const bound = (): readonly PlanEpic[] => [
    epic(FIRST, { binding: BINDING, railOrder: 0 }),
    epic(SECOND, { name: 'Checkout', railOrder: 1 }),
  ]

  it('survives a rename', async () => {
    const { service, store } = build()
    await seed(store, { epics: bound() })
    const next = await service.update(at, FIRST, { name: 'Research' })
    expect(pick(next, FIRST).binding).toEqual(BINDING)
  })

  it('survives a recolour', async () => {
    const { service, store } = build()
    await seed(store, { epics: bound() })
    const next = await service.update(at, FIRST, { colour: '#1f2a37' })
    expect(pick(next, FIRST).binding).toEqual(BINDING)
  })

  it('survives a move to another rail order', async () => {
    const { service, store } = build()
    await seed(store, { epics: bound() })
    expect(pick(await service.place(at, FIRST, 1), FIRST).binding).toEqual(BINDING)
  })

  it('survives another epic being added beneath it', async () => {
    const { service, store } = build()
    await seed(store, { epics: bound() })
    expect(pick(await service.add(at, { name: 'Growth' }), FIRST).binding).toEqual(BINDING)
  })

  it('survives another epic being removed above it', async () => {
    const { service, store } = build()
    await seed(store, { epics: bound() })
    expect(pick(await service.remove(at, SECOND), FIRST).binding).toEqual(BINDING)
  })
})

describe('EpicService.place', () => {
  it('moves the named rail and leaves its siblings in the order they were in', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.place(at, FIRST, 2)
    expect(railsOf(next)).toEqual([SECOND, THIRD, FIRST])
    expect(ordersOf(next)).toEqual([0, 1, 2])
  })

  it('moves a rail backwards', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    expect(railsOf(await service.place(at, THIRD, 0))).toEqual([THIRD, FIRST, SECOND])
  })

  it('clamps a rail order past the last rail', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    expect(railsOf(await service.place(at, FIRST, 99))).toEqual([SECOND, THIRD, FIRST])
  })

  it('moves nothing when the rail is already where it is going', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.place(at, SECOND, 1)
    expect(next.epics).toEqual(threeRails())
  })

  it('leaves the features on every rail exactly where they were', async () => {
    const { service, store } = build()
    const features = [feature(marked('FT', 1), FIRST), feature(marked('FT', 2), SECOND)]
    await seed(store, { epics: threeRails(), features })
    expect((await service.place(at, FIRST, 2)).features).toEqual(features)
  })

  it('rejects an unknown epic', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    await expect(service.place(at, ABSENT, 0)).rejects.toThrow(NotFound)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { epics: threeRails() })
    await service.place(at, FIRST, 2)
    expect(runs()).toBe(1)
  })
})

describe('EpicService.remove', () => {
  it('removes the rail and renumbers the rails that are left densely', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    const next = await service.remove(at, SECOND)
    expect(railsOf(next)).toEqual([FIRST, THIRD])
    expect(ordersOf(next)).toEqual([0, 1])
  })

  it('rejects an absent epic', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    await expect(service.remove(at, ABSENT)).rejects.toThrow(NotFound)
  })

  it('rejects an unknown plan', async () => {
    const { service } = build()
    await expect(service.remove(at, FIRST)).rejects.toThrow(NotFound)
  })

  it('persists the removal, so a read afterwards agrees', async () => {
    const { service, store } = build()
    await seed(store, { epics: threeRails() })
    await service.remove(at, SECOND)
    const stored = await store.readManifest('macroplan', PLAN)
    expect(stored?.epics.map((each) => each.id)).toEqual([FIRST, THIRD])
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, store } = build(lock)
    await seed(store, { epics: threeRails() })
    await service.remove(at, SECOND)
    expect(runs()).toBe(1)
  })
})
