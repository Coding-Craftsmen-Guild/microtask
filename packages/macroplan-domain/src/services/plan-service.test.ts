import { describe, expect, it } from 'vitest'
import type { Lock } from '@repo/kernel'
import { Invalid, NotFound, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import { LIMITS } from '../limits.js'
import {
  MemoryPlanStore,
  countingLock,
  fixedClock,
  marked,
  planManifest,
  sequentialIds,
} from '../testing/index.js'
import type { PlanRef } from './refs.js'
import { PlanService } from './plan-service.js'

const NOW = '2026-09-23T12:00:00.000Z'
const EARLIER = '2026-01-01T00:00:00.000Z'
const TOKEN = 'tok_launchlaunchlau'
const ABSENT = marked('PN', 999)

const ref = (planId: string): PlanRef => ({ product: 'macroplan', planId })

const build = (lock: Lock = new QueueLock()) => {
  const store = new MemoryPlanStore()
  const tokens = new ShareIndex()
  const service = new PlanService({
    store,
    tokens,
    lock,
    clock: fixedClock(NOW),
    ids: sequentialIds(),
  })
  return { store, service, tokens }
}

const fill = async (store: MemoryPlanStore, count: number): Promise<void> => {
  const ids = sequentialIds(1000)
  for (let i = 0; i < count; i += 1) await store.saveManifest('macroplan', planManifest(ids.entityId()))
}

describe('PlanService.create', () => {
  it('stamps createdAt and updatedAt from the injected clock, and takes its id from the ids generator', async () => {
    const { service } = build()
    const plan = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    expect(plan.createdAt).toBe(NOW)
    expect(plan.updatedAt).toBe(NOW)
    expect(plan.id).not.toBe('')
  })

  it('applies the two defaults when neither is supplied', async () => {
    const { service } = build()
    const plan = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    expect(plan.sprintLengthDays).toBe(10)
    expect(plan.timezone).toBe('UTC')
  })

  it('applies a supplied sprintLengthDays and timezone instead of the defaults', async () => {
    const { service } = build()
    const plan = await service.create('macroplan', {
      name: 'Launch',
      startDate: '2026-01-05',
      sprintLengthDays: 5,
      timezone: 'Europe/Belgrade',
    })
    expect(plan.sprintLengthDays).toBe(5)
    expect(plan.timezone).toBe('Europe/Belgrade')
  })

  it('refuses a timezone Intl cannot resolve', async () => {
    const { service } = build()
    await expect(
      service.create('macroplan', { name: 'Launch', startDate: '2026-01-05', timezone: 'Not/AZone' }),
    ).rejects.toThrow(Invalid)
  })

  it('succeeds one below the plansPerProduct cap', async () => {
    const { service, store } = build()
    await fill(store, LIMITS.plansPerProduct - 1)
    await expect(
      service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' }),
    ).resolves.toMatchObject({ name: 'Launch' })
  })

  it('refuses to exceed the plansPerProduct cap, naming the limit', async () => {
    const { service, store } = build()
    await fill(store, LIMITS.plansPerProduct)
    await expect(
      service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' }),
    ).rejects.toThrow(/plans/)
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service } = build(lock)
    await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    expect(runs()).toBe(1)
  })
})

describe('PlanService.read', () => {
  it('throws NotFound for an absent plan', async () => {
    await expect(build().service.read(ref(ABSENT))).rejects.toThrow(NotFound)
  })

  it('is readable straight back after create', async () => {
    const { service } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    await expect(service.read(ref(created.id))).resolves.toEqual(created)
  })
})

describe('PlanService.update', () => {
  it('changes the name, bumps updatedAt, and leaves the rest byte-identical', async () => {
    const { service, store } = build()
    const created = await service.create('macroplan', { name: 'Old', startDate: '2026-01-05' })
    await store.saveManifest('macroplan', { ...created, updatedAt: EARLIER })
    const updated = await service.update(ref(created.id), { name: 'New' })
    expect(updated.name).toBe('New')
    expect(updated.updatedAt).toBe(NOW)
    expect(updated.startDate).toBe(created.startDate)
    expect(updated.epics).toEqual(created.epics)
    expect(updated.features).toEqual(created.features)
    expect(updated.items).toEqual(created.items)
  })

  it('changes only startDate when that alone is given', async () => {
    const { service } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    const updated = await service.update(ref(created.id), { startDate: '2026-02-01' })
    expect(updated.startDate).toBe('2026-02-01')
    expect(updated.name).toBe(created.name)
    expect(updated.sprintLengthDays).toBe(created.sprintLengthDays)
    expect(updated.timezone).toBe(created.timezone)
  })

  it('moves the calendar when sprintLengthDays changes, and that is allowed', async () => {
    const { service } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    const updated = await service.update(ref(created.id), { sprintLengthDays: 6 })
    expect(updated.sprintLengthDays).toBe(6)
  })

  it('refuses a new timezone Intl cannot resolve', async () => {
    const { service } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    await expect(service.update(ref(created.id), { timezone: 'Not/AZone' })).rejects.toThrow(Invalid)
  })

  it('rejects an unknown plan', async () => {
    await expect(build().service.update(ref(ABSENT), { name: 'New' })).rejects.toThrow(NotFound)
  })

  it('updates twice in a row, so reading inside the lock has not wedged the queue', async () => {
    const { service } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    await service.update(ref(created.id), { name: 'Mid' })
    const updated = await service.update(ref(created.id), { name: 'End' })
    expect(updated.name).toBe('End')
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service } = build(lock)
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    const before = runs()
    await service.update(ref(created.id), { name: 'New' })
    expect(runs()).toBe(before + 1)
  })
})

describe('PlanService.remove', () => {
  it('removes the plan', async () => {
    const { service } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    await service.remove(ref(created.id))
    await expect(service.read(ref(created.id))).rejects.toThrow(NotFound)
  })

  it('rejects an unknown plan rather than reporting success', async () => {
    await expect(build().service.remove(ref(ABSENT))).rejects.toThrow(NotFound)
  })

  it('drops the share tokens of a removed plan, so a link to it resolves to nothing', async () => {
    const { service, store, tokens } = build()
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    const shared = {
      ...created,
      shareLinks: [
        { token: TOKEN, name: 'Jane at ACME', role: 'view' as const, createdBy: null, createdAt: EARLIER },
      ],
    }
    await store.saveManifest('macroplan', shared)
    tokens.add({ product: 'macroplan', containerId: created.id }, [TOKEN])
    expect(tokens.find(TOKEN)).toEqual({ product: 'macroplan', containerId: created.id })
    await service.remove(ref(created.id))
    expect(tokens.find(TOKEN)).toBeNull()
  })

  it('takes the lock exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service } = build(lock)
    const created = await service.create('macroplan', { name: 'Launch', startDate: '2026-01-05' })
    const before = runs()
    await service.remove(ref(created.id))
    expect(runs()).toBe(before + 1)
  })
})
