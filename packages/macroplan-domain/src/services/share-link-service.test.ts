import { describe, expect, it } from 'vitest'
import type { IdGenerator, Lock } from '@repo/kernel'
import { Conflict, Invalid, NotFound, ShareIndex } from '@repo/kernel'
import { QueueLock } from '@repo/store'
import type { PlanManifest, PlanShareLink } from '../entities/plan.js'
import { LIMITS } from '../limits.js'
import {
  RecordingPlanStore,
  STAMP,
  countingLock,
  fixedClock,
  marked,
  planManifest,
  sequentialIds,
} from '../testing/index.js'
import type { PlanRef } from './refs.js'
import { PlanShareLinkService } from './share-link-service.js'

const NOW = '2026-09-23T12:00:00.000Z'
const EARLIER = '2026-01-01T00:00:00.000Z'
const PLAN = marked('PN', 1)
const ABSENT = marked('PN', 999)
const PROJECT = marked('PJ', 1)
const FIRST_TOKEN = 'tok_0000000000000002'

const AT: PlanRef = { product: 'macroplan', planId: PLAN }
const MISSING: PlanRef = { product: 'macroplan', planId: ABSENT }

const seat = (token: string, overrides: Partial<PlanShareLink> = {}): PlanShareLink => ({
  token,
  name: 'Jane at ACME',
  role: 'manage',
  createdBy: null,
  createdAt: STAMP,
  ...overrides,
})

const asAdmin = { name: 'Jane at ACME', role: 'view', createdBy: null } as const

const idsMinting = (token: string): IdGenerator => {
  const base = sequentialIds()
  return { entityId: () => base.entityId(), token: () => token }
}

const build = (lock: Lock = new QueueLock(), ids: IdGenerator = sequentialIds()) => {
  const store = new RecordingPlanStore()
  const tokens = new ShareIndex()
  const service = new PlanShareLinkService({
    store,
    tokens,
    lock,
    clock: fixedClock(NOW),
    ids,
  })
  const seed = async (seats: readonly PlanShareLink[] = []): Promise<PlanManifest> => {
    const seeded = planManifest(PLAN, { shareLinks: seats, updatedAt: EARLIER })
    await store.saveManifest('macroplan', seeded)
    tokens.add({ product: 'macroplan', containerId: PLAN }, seats.map((one) => one.token))
    store.writes.length = 0
    return seeded
  }
  const read = async (): Promise<PlanManifest> => {
    const found = await store.readManifest('macroplan', PLAN)
    if (found === null) throw new Error('seed missing')
    return found
  }
  return { store, service, tokens, seed, read }
}

const fill = (count: number): readonly PlanShareLink[] =>
  Array.from({ length: count }, (_, index) => seat(`tok_seeded_${index}`))

const tokensOf = (manifest: PlanManifest): readonly string[] =>
  manifest.shareLinks.map((one) => one.token)

describe('PlanShareLinkService.create', () => {
  it('stores exactly the five seat fields, with no scope among them', async () => {
    const { service, seed, read } = build()
    await seed([seat('tok_parent_seat_0001')])
    const { link } = await service.create(AT, {
      name: 'Jane at ACME',
      role: 'write',
      createdBy: 'tok_parent_seat_0001',
    })
    const expected = {
      token: FIRST_TOKEN,
      name: 'Jane at ACME',
      role: 'write',
      createdBy: 'tok_parent_seat_0001',
      createdAt: NOW,
    }
    expect(link).toEqual(expected)
    expect((await read()).shareLinks[1]).toEqual(expected)
  })

  it('stores createdBy as given, so a mint through a seat records that seat as the parent', async () => {
    const { service, seed } = build()
    await seed([seat('tok_parent_seat_0001')])
    const minted = await service.create(AT, { ...asAdmin, createdBy: 'tok_parent_seat_0001' })
    expect(minted.link.createdBy).toBe('tok_parent_seat_0001')
  })

  it('records createdBy null when the admin mints a seat', async () => {
    const { service, seed } = build()
    await seed()
    expect((await service.create(AT, asAdmin)).link.createdBy).toBeNull()
  })

  it('takes the token from ctx.ids.token(), not from anything of its own', async () => {
    const { service, seed } = build()
    await seed()
    const { link } = await service.create(AT, asAdmin)
    expect(sequentialIds().token()).toBe(FIRST_TOKEN)
    expect(link.token).toBe(FIRST_TOKEN)
  })

  it('cleans the name it is given', async () => {
    const { service, seed } = build()
    await seed()
    const { link } = await service.create(AT, { ...asAdmin, name: '  Jane   at ACME  ' })
    expect(link.name).toBe('Jane at ACME')
  })

  it('refuses an empty name', async () => {
    const { service, seed } = build()
    await seed()
    await expect(service.create(AT, { ...asAdmin, name: '' })).rejects.toThrow(Invalid)
  })

  it('answers the saved plan, stamped as changed and holding the new seat', async () => {
    const { service, seed, read } = build()
    await seed()
    const { manifest, link } = await service.create(AT, asAdmin)
    expect(manifest.updatedAt).toBe(NOW)
    expect(manifest.shareLinks).toEqual([link])
    expect(await read()).toEqual(manifest)
  })

  it('rejects an unknown plan', async () => {
    await expect(build().service.create(MISSING, asAdmin)).rejects.toThrow(NotFound)
  })

  it('registers the token in the index, which resolves it to this plan', async () => {
    const { service, seed, tokens } = build()
    await seed()
    const { link } = await service.create(AT, asAdmin)
    expect(tokens.find(link.token)).toEqual({ product: 'macroplan', containerId: PLAN })
  })

  it('keeps the seats the plan already held registered alongside the new one', async () => {
    const { service, seed, tokens } = build()
    await seed([seat('tok_already_held_001')])
    const { link } = await service.create(AT, asAdmin)
    expect(tokens.find('tok_already_held_001')).toEqual({
      product: 'macroplan',
      containerId: PLAN,
    })
    expect(tokens.find(link.token)).toEqual({ product: 'macroplan', containerId: PLAN })
  })
})

describe('PlanShareLinkService.create token collisions', () => {
  const heldByAProject = (tokens: ShareIndex, token: string): void => {
    tokens.add({ product: 'microtask', containerId: PROJECT }, [token])
  }

  it('throws Conflict when a Microtask project already holds the minted token', async () => {
    const { service, seed, tokens } = build(new QueueLock(), idsMinting('tok_taken'))
    await seed()
    heldByAProject(tokens, 'tok_taken')
    await expect(service.create(AT, asAdmin)).rejects.toThrow(Conflict)
  })

  it('leaves the manifest exactly as it was, and writes nothing to the store', async () => {
    const { service, seed, read, store, tokens } = build(new QueueLock(), idsMinting('tok_taken'))
    const seeded = await seed([seat('tok_mine_already_01')])
    heldByAProject(tokens, 'tok_taken')
    await expect(service.create(AT, asAdmin)).rejects.toThrow(Conflict)
    expect(await read()).toEqual(seeded)
    expect(store.methods()).toEqual([])
  })

  it('leaves the index pointing at the project that already owned the token', async () => {
    const { service, seed, tokens } = build(new QueueLock(), idsMinting('tok_taken'))
    await seed([seat('tok_mine_already_01')])
    heldByAProject(tokens, 'tok_taken')
    await expect(service.create(AT, asAdmin)).rejects.toThrow(Conflict)
    expect(tokens.find('tok_taken')).toEqual({ product: 'microtask', containerId: PROJECT })
    expect(tokens.find('tok_mine_already_01')).toEqual({
      product: 'macroplan',
      containerId: PLAN,
    })
  })
})

describe('PlanShareLinkService caps', () => {
  it('mints one more seat at one below the shareLinksPerPlan cap', async () => {
    const { service, seed } = build()
    await seed(fill(LIMITS.shareLinksPerPlan - 1))
    await expect(service.create(AT, asAdmin)).resolves.toMatchObject({
      link: { name: 'Jane at ACME' },
    })
  })

  it('refuses a seat at the shareLinksPerPlan cap, naming the limit', async () => {
    const { service, seed } = build()
    await seed(fill(LIMITS.shareLinksPerPlan))
    await expect(service.create(AT, asAdmin)).rejects.toThrow(
      new RegExp(`share links for this plan — the limit is ${LIMITS.shareLinksPerPlan}`),
    )
  })

  it('throws Invalid at the cap rather than any other error', async () => {
    const { service, seed } = build()
    await seed(fill(LIMITS.shareLinksPerPlan))
    await expect(service.create(AT, asAdmin)).rejects.toThrow(Invalid)
  })

  it('holds the cap under two concurrent mints, because the count is read inside the lock', async () => {
    const { service, seed, read } = build()
    await seed(fill(LIMITS.shareLinksPerPlan - 1))
    const settled = await Promise.allSettled([
      service.create(AT, asAdmin),
      service.create(AT, asAdmin),
    ])
    expect(settled.map((result) => result.status)).toEqual(['fulfilled', 'rejected'])
    expect((await read()).shareLinks).toHaveLength(LIMITS.shareLinksPerPlan)
  })
})

describe('PlanShareLinkService.update', () => {
  it('changes the name and the role while keeping the token, lineage and minting time', async () => {
    const { service, seed } = build()
    await seed([seat('tok_renamed_seat_01', { name: 'Old', role: 'view' })])
    const manifest = await service.update(AT, 'tok_renamed_seat_01', {
      name: 'New',
      role: 'manage',
    })
    expect(manifest.shareLinks).toEqual([
      {
        token: 'tok_renamed_seat_01',
        name: 'New',
        role: 'manage',
        createdBy: null,
        createdAt: STAMP,
      },
    ])
  })

  it('changes the role alone when that alone is given', async () => {
    const { service, seed } = build()
    await seed([seat('tok_role_only_seat1', { name: 'Jane at ACME', role: 'view' })])
    const manifest = await service.update(AT, 'tok_role_only_seat1', { role: 'write' })
    expect(manifest.shareLinks[0]?.role).toBe('write')
    expect(manifest.shareLinks[0]?.name).toBe('Jane at ACME')
  })

  it('accepts an empty name, which create refuses, so a loaded unnamed seat can be saved', async () => {
    const { service, seed } = build()
    await seed([seat('tok_unnamed_seat_01')])
    const manifest = await service.update(AT, 'tok_unnamed_seat_01', { name: '' })
    expect(manifest.shareLinks[0]?.name).toBe('')
    await expect(service.create(AT, { ...asAdmin, name: '' })).rejects.toThrow(Invalid)
  })

  it('leaves every other seat alone and keeps them in minting order', async () => {
    const { service, seed } = build()
    const seats = [seat('tok_first_seat_0001'), seat('tok_second_seat_001'), seat('tok_third_seat_0001')]
    await seed(seats)
    const manifest = await service.update(AT, 'tok_second_seat_001', { name: 'Renamed' })
    expect(tokensOf(manifest)).toEqual(seats.map((one) => one.token))
    expect(manifest.shareLinks[0]).toEqual(seats[0])
    expect(manifest.shareLinks[2]).toEqual(seats[2])
  })

  it('stamps the plan as changed', async () => {
    const { service, seed, read } = build()
    await seed([seat('tok_stamped_seat_01')])
    const manifest = await service.update(AT, 'tok_stamped_seat_01', { name: 'New' })
    expect(manifest.updatedAt).toBe(NOW)
    expect(await read()).toEqual(manifest)
  })

  it('keeps the token resolvable in the index after a rename', async () => {
    const { service, seed, tokens } = build()
    await seed([seat('tok_still_resolves1')])
    await service.update(AT, 'tok_still_resolves1', { name: 'New' })
    expect(tokens.find('tok_still_resolves1')).toEqual({
      product: 'macroplan',
      containerId: PLAN,
    })
  })

  it('throws NotFound for a token the plan does not hold', async () => {
    const { service, seed } = build()
    await seed([seat('tok_present_seat_01')])
    await expect(service.update(AT, 'tok_absent_seat_01', { name: 'New' })).rejects.toThrow(NotFound)
  })

  it('throws NotFound for an unknown plan', async () => {
    await expect(build().service.update(MISSING, 'tok_any', { name: 'New' })).rejects.toThrow(
      NotFound,
    )
  })

  it('updates twice in a row, so reading inside the lock has not wedged the queue', async () => {
    const { service, seed } = build()
    await seed([seat('tok_twice_seat_0001')])
    await service.update(AT, 'tok_twice_seat_0001', { name: 'Mid' })
    const manifest = await service.update(AT, 'tok_twice_seat_0001', { name: 'End' })
    expect(manifest.shareLinks[0]?.name).toBe('End')
  })
})

describe('PlanShareLinkService.revoke', () => {
  const chain = (): readonly PlanShareLink[] => [
    seat('tok_root_manager_01'),
    seat('tok_child_manager_1', { createdBy: 'tok_root_manager_01' }),
    seat('tok_grandchild_seat', { createdBy: 'tok_child_manager_1' }),
    seat('tok_great_grand_seat', { createdBy: 'tok_grandchild_seat' }),
    seat('tok_unrelated_seat_1'),
  ]

  it('drops a lineage four seats deep in one manifest write, returning every token dropped', async () => {
    const { service, seed, store, read } = build()
    await seed(chain())
    const { revoked } = await service.revoke(AT, 'tok_root_manager_01')
    expect(revoked).toEqual([
      'tok_root_manager_01',
      'tok_child_manager_1',
      'tok_grandchild_seat',
      'tok_great_grand_seat',
    ])
    expect(tokensOf(await read())).toEqual(['tok_unrelated_seat_1'])
    expect(store.methods()).toEqual(['saveManifest'])
  })

  it('drops every revoked token from the index and leaves the unrelated seat resolvable', async () => {
    const { service, seed, tokens } = build()
    await seed(chain())
    const { revoked } = await service.revoke(AT, 'tok_root_manager_01')
    expect(revoked.map((token) => tokens.find(token))).toEqual([null, null, null, null])
    expect(tokens.find('tok_unrelated_seat_1')).toEqual({
      product: 'macroplan',
      containerId: PLAN,
    })
  })

  it('revokes from the middle of a lineage, keeping the seat that minted it', async () => {
    const { service, seed, read } = build()
    await seed(chain())
    const { revoked } = await service.revoke(AT, 'tok_child_manager_1')
    expect(revoked).toEqual(['tok_child_manager_1', 'tok_grandchild_seat', 'tok_great_grand_seat'])
    expect(tokensOf(await read())).toEqual(['tok_root_manager_01', 'tok_unrelated_seat_1'])
  })

  it('drops a seat and the two it minted, returning all three tokens', async () => {
    const { service, seed, read, tokens } = build()
    await seed([
      seat('tok_two_child_parent'),
      seat('tok_first_child_seat', { createdBy: 'tok_two_child_parent' }),
      seat('tok_second_child_sea', { createdBy: 'tok_two_child_parent' }),
    ])
    const { revoked } = await service.revoke(AT, 'tok_two_child_parent')
    expect(revoked).toEqual([
      'tok_two_child_parent',
      'tok_first_child_seat',
      'tok_second_child_sea',
    ])
    expect((await read()).shareLinks).toEqual([])
    expect(revoked.map((token) => tokens.find(token))).toEqual([null, null, null])
  })

  it('takes nothing else when the revoked seat minted nothing', async () => {
    const { service, seed, read } = build()
    await seed([seat('tok_leaf_seat_00001'), seat('tok_other_leaf_seat1')])
    const { revoked } = await service.revoke(AT, 'tok_leaf_seat_00001')
    expect(revoked).toEqual(['tok_leaf_seat_00001'])
    expect(tokensOf(await read())).toEqual(['tok_other_leaf_seat1'])
  })

  it('ends the walk on a createdBy cycle rather than looping on it', async () => {
    const { service, seed } = build()
    await seed([
      seat('tok_cycle_seat_one1', { createdBy: 'tok_cycle_seat_two1' }),
      seat('tok_cycle_seat_two1', { createdBy: 'tok_cycle_seat_one1' }),
    ])
    const { revoked } = await service.revoke(AT, 'tok_cycle_seat_one1')
    expect(revoked).toEqual(['tok_cycle_seat_one1', 'tok_cycle_seat_two1'])
  })

  it('answers the saved plan, stamped as changed', async () => {
    const { service, seed, read } = build()
    await seed([seat('tok_stamped_revoke1')])
    const { manifest } = await service.revoke(AT, 'tok_stamped_revoke1')
    expect(manifest.updatedAt).toBe(NOW)
    expect(await read()).toEqual(manifest)
  })

  it('throws NotFound for a token the plan does not hold', async () => {
    const { service, seed } = build()
    await seed([seat('tok_present_seat_01')])
    await expect(service.revoke(AT, 'tok_absent_seat_01')).rejects.toThrow(NotFound)
  })

  it('throws NotFound for an unknown plan', async () => {
    await expect(build().service.revoke(MISSING, 'tok_any')).rejects.toThrow(NotFound)
  })
})

describe('PlanShareLinkService locking', () => {
  it('mints inside lock.run, exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, seed } = build(lock)
    await seed()
    await service.create(AT, asAdmin)
    expect(runs()).toBe(1)
  })

  it('renames inside lock.run, exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, seed } = build(lock)
    await seed([seat('tok_locked_rename1')])
    await service.update(AT, 'tok_locked_rename1', { name: 'New' })
    expect(runs()).toBe(1)
  })

  it('revokes inside lock.run, exactly once', async () => {
    const { lock, runs } = countingLock(new QueueLock())
    const { service, seed } = build(lock)
    await seed([seat('tok_locked_revoke1')])
    await service.revoke(AT, 'tok_locked_revoke1')
    expect(runs()).toBe(1)
  })
})

describe('PlanShareLinkService surface', () => {
  it('exposes exactly three methods, so a fourth is a decision and not an accident', () => {
    expect(Object.getOwnPropertyNames(PlanShareLinkService.prototype).sort()).toEqual([
      'constructor',
      'create',
      'revoke',
      'update',
    ])
  })
})
