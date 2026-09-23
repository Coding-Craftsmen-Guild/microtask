import { ApiError, type MacroplanSessionClient } from '@repo/api-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clientFor } from '../../../lib/api'
import {
  currentShareKey,
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  holdingSeat,
  holdingStoredSeat,
  itemReadKey,
  listKey,
  planReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from './fake-plan-api'
import {
  ADMIN_TOKEN,
  atlasPlan,
  beaconPlan,
  ITEM_1,
  ITEM_2,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  PLAN_B,
  PLAN_GONE,
  REVOKED_SEAT_TOKEN,
  SEAT_TOKEN,
  WRITE_SEAT_TOKEN,
} from './plan-fixture'

const OPTIONS = { baseUrl: 'http://api.internal:4321', serviceKey: 'the-macroplan-service-key' }

let api: FakePlanApiState

beforeEach(() => {
  api = fakePlanApiState()
  api.plans = [atlasPlan(), beaconPlan()]
  vi.stubGlobal('fetch', fakePlanFetch(api))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const asAdmin = (): MacroplanSessionClient => {
  holdingAdmin(api)
  return clientFor({ kind: 'admin', token: ADMIN_TOKEN }, OPTIONS)
}

const asStoredSeat = (token: string): MacroplanSessionClient => {
  holdingStoredSeat(api, atlasPlan(), token)
  return clientFor({ kind: 'link', token }, OPTIONS)
}

const statusOf = async (call: Promise<unknown>): Promise<number> => {
  try {
    await call
  } catch (error) {
    if (error instanceof ApiError) return error.status
    throw error
  }
  throw new Error('nothing was refused')
}

describe('the collection, which is admin-only', () => {
  it('answers an admin every plan, newest update first however they were seeded', async () => {
    api.plans = [beaconPlan(), atlasPlan()]
    const { plans } = await asAdmin().plans.list()
    expect(plans.map((one) => one.id)).toEqual([PLAN_A, PLAN_B])
  })

  it('refuses every seat role, rather than filtering the list down to its own plan', async () => {
    for (const token of [SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN]) {
      expect(await statusOf(asStoredSeat(token).plans.list())).toBe(403)
    }
  })

  it('counts the seats for the admin and never carries one of their tokens', async () => {
    const { plans } = await asAdmin().plans.list()
    expect(plans[0]?.shareLinkCount).toBe(3)
    expect(JSON.stringify(plans)).not.toContain(SEAT_TOKEN)
  })

  it('lets the collection be overridden by its own key builder', async () => {
    api.answers.set(listKey(), () => problemAnswer(403))
    expect(await statusOf(asAdmin().plans.list())).toBe(403)
  })
})

describe('one plan, and the share block the caller may or may not be told', () => {
  it('carries every seat for the admin', async () => {
    expect((await asAdmin().plans.read(PLAN_A)).shareLinks).toHaveLength(3)
  })

  it('carries them for a manage seat, which holds share:read', async () => {
    expect((await asStoredSeat(MANAGE_SEAT_TOKEN).plans.read(PLAN_A)).shareLinks).toHaveLength(3)
  })

  it.each([
    ['view', SEAT_TOKEN],
    ['write', WRITE_SEAT_TOKEN],
  ])('leaves the block off a %s seat, absent and not an empty array', async (_role, token) => {
    const found = await asStoredSeat(token).plans.read(PLAN_A)
    expect(found.shareLinks).toBeUndefined()
    expect(Object.keys(found)).not.toContain('shareLinks')
  })

  it('answers the plan a seat is rooted in, with its rails and its schedule', async () => {
    const found = await asStoredSeat(SEAT_TOKEN).plans.read(PLAN_A)
    expect(found.epics).toHaveLength(1)
    expect(found.schedule.spans).toHaveLength(5)
  })

  it('refuses a seat any plan but its own, and says nothing about whether that plan exists', async () => {
    const seat = asStoredSeat(SEAT_TOKEN)
    expect(await statusOf(seat.plans.read(PLAN_B))).toBe(403)
    expect(await statusOf(seat.plans.read(PLAN_GONE))).toBe(403)
  })

  it('answers the admin 404 for a plan nothing holds', async () => {
    expect(await statusOf(asAdmin().plans.read(PLAN_GONE))).toBe(404)
  })

  it('lets one route be overridden by its own key builder', async () => {
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(409))
    expect(await statusOf(asAdmin().plans.read(PLAN_A))).toBe(409)
  })
})

describe('one item, and its description', () => {
  it('answers the description the fake holds, and an empty one for an item it does not', async () => {
    api.descriptions.set(ITEM_1, 'the sessions note')
    expect((await asAdmin().plans.readItem(PLAN_A, ITEM_1)).description).toBe('the sessions note')
    expect((await asAdmin().plans.readItem(PLAN_A, ITEM_2)).description).toBe('')
  })

  it('answers a seat its own plan’s item, and refuses one outside it', async () => {
    expect((await asStoredSeat(SEAT_TOKEN).plans.readItem(PLAN_A, ITEM_1)).id).toBe(ITEM_1)
    expect(await statusOf(asStoredSeat(SEAT_TOKEN).plans.readItem(PLAN_B, ITEM_1))).toBe(403)
  })

  it('answers 404 for an item the plan does not hold', async () => {
    expect(await statusOf(asAdmin().plans.readItem(PLAN_A, PLAN_GONE))).toBe(404)
  })

  it('lets one item read be overridden by its own key builder', async () => {
    api.answers.set(itemReadKey(PLAN_A, ITEM_1), () => problemAnswer(404))
    expect(await statusOf(asAdmin().plans.readItem(PLAN_A, ITEM_1))).toBe(404)
  })
})

describe('the seat a caller presented, looked up rather than rebuilt', () => {
  it('answers the plan it opens and the role the manifest stores', async () => {
    const found = await asStoredSeat(MANAGE_SEAT_TOKEN).currentShare()
    expect(found).toEqual({
      role: 'manage',
      scope: { kind: 'plan', planId: PLAN_A },
      plan: { id: PLAN_A, name: 'Atlas rollout' },
    })
  })

  it('answers the stored role even when the resolved principal claims another', async () => {
    holdingSeat(api, PLAN_A, 'manage', SEAT_TOKEN)
    const found = await clientFor({ kind: 'link', token: SEAT_TOKEN }, OPTIONS).currentShare()
    expect(found.role).toBe('view')
  })

  it('answers 404 for a token no manifest holds, as a seat revoked mid-flight is', async () => {
    holdingSeat(api, PLAN_A, 'view', REVOKED_SEAT_TOKEN)
    const seat = clientFor({ kind: 'link', token: REVOKED_SEAT_TOKEN }, OPTIONS)
    expect(await statusOf(seat.currentShare())).toBe(404)
  })

  it('answers an admin 404, because an admin credential names no seat', async () => {
    expect(await statusOf(asAdmin().currentShare())).toBe(404)
  })

  it('lets the current-share read be overridden by its own key builder', async () => {
    api.answers.set(currentShareKey(), () => problemAnswer(401))
    expect(await statusOf(asStoredSeat(SEAT_TOKEN).currentShare())).toBe(401)
  })
})

describe('what the fake refuses before it routes anything', () => {
  it('answers 401 for a bearer it does not know, and records the attempt', async () => {
    const stranger = clientFor({ kind: 'link', token: 'a_stranger_token_01' }, OPTIONS)
    expect(await statusOf(stranger.currentShare())).toBe(401)
    expect(trace(api)).toEqual(['GET /v1/macroplan/shares/current a_stranger_token_01'])
  })

  it('answers 404 for a path below plans that names no route', async () => {
    holdingAdmin(api)
    const response = await fetch(`${OPTIONS.baseUrl}/v1/macroplan/plans/${PLAN_A}/epics`, {
      method: 'GET',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    expect(response.status).toBe(404)
  })

  it('answers 405 for a method it serves no route for at all', async () => {
    holdingAdmin(api)
    const response = await fetch(`${OPTIONS.baseUrl}/v1/macroplan/plans`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_TOKEN}` },
    })
    expect(response.status).toBe(405)
  })

  it('records the bearer of every request, in order', async () => {
    await asAdmin().plans.list()
    await asStoredSeat(SEAT_TOKEN).plans.read(PLAN_A)
    expect(trace(api)).toEqual([
      `GET /v1/macroplan/plans ${ADMIN_TOKEN}`,
      `GET /v1/macroplan/plans/${PLAN_A} ${SEAT_TOKEN}`,
    ])
  })
})

describe('the fixture, which must not leak between tests', () => {
  it('builds a fresh manifest per call, so a mutation cannot reach the next test', () => {
    const one = atlasPlan()
    one.items.push(...one.items.slice(0, 1))
    one.shareLinks.length = 0
    expect(atlasPlan().items).toHaveLength(3)
    expect(atlasPlan().shareLinks).toHaveLength(3)
    expect(beaconPlan().schedule.spans).toHaveLength(0)
  })

  it('refuses to seed a stored seat a plan does not hold', () => {
    expect(() => holdingStoredSeat(api, beaconPlan(), SEAT_TOKEN)).toThrow(/holds no seat/)
  })
})
