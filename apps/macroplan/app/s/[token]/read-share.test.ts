import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentShareKey,
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  holdingSeat,
  holdingStoredSeat,
  planReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../../components/plan/testing/fake-plan-api'
import {
  ADMIN_TOKEN,
  atlasPlan,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  REVOKED_SEAT_TOKEN,
  SEAT_TOKEN,
} from '../../../components/plan/testing/plan-fixture'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

// What this file is for, and what it deliberately leaves to its neighbours. The status→outcome
// mapping — a segment that cannot be a token, 401, 403, 409, 500, an unreachable API, and
// `linkRead`'s 404/422 — belongs to `linkCall`, is unit-tested in `actions/link-call.test.ts` over
// every one of those, and is re-asserted end to end through the page in `page.test.tsx`. Testing it a
// third time here would pin the same matrix in three places and make one of them the stale copy. What
// is **this module's own** is what neither neighbour can see: which wrapper each read takes (so a
// token naming nobody redirects where a missing plan 404s), that the plan id comes from the bootstrap,
// and `seatless`, which has no equivalent in apps/microtask at all.
//
// The `Redirected`/`NotFound` doubles and the `next/*` mocks are declared per file, as the five other
// test files in this app declare them. Factoring them out would mean editing those too, including one
// another agent is in.
//
// As in page.test.tsx: a cookie read anywhere under these reads fails the file rather than passing.
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a seat read must not read a cookie')
  },
  headers: () => {
    throw new Error('a seat read must not read a header')
  },
}))

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

class NotFound extends Error {}

vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('notFound')
  },
}))

let api: FakePlanApiState

// Every answer body the fake put on the wire, so "the page's value carries no token" can be checked
// against what the API actually handed over rather than against an assumption about it.
const answered: unknown[] = []

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakePlanApiState()
  api.plans = [atlasPlan()]
  answered.length = 0
  const fake = fakePlanFetch(api)
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const answer = await fake(url, init)
    answered.push(await answer.clone().json())
    return answer
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { readSeatPlan, readShare } = await import('./read-share')

const thrownBy = async (run: Promise<unknown>): Promise<unknown> => {
  try {
    await run
  } catch (error) {
    return error
  }
  throw new Error('nothing was thrown')
}

const redirectOf = async (run: Promise<unknown>): Promise<string> => {
  const thrown = await thrownBy(run)
  if (thrown instanceof Redirected) return thrown.location
  throw new Error(`expected a redirect, got ${String(thrown)}`)
}

const bodiesWith = (token: string): unknown[] =>
  answered.filter((body) => JSON.stringify(body).includes(token))

describe('the bootstrap a seat page makes first', () => {
  it('asks shares/current under the URL token and nothing else', async () => {
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    const share = await readShare(SEAT_TOKEN)
    expect(share).toMatchObject({ ok: true, value: { role: 'view' } })
    expect(trace(api)).toEqual([`${currentShareKey()} ${SEAT_TOKEN}`])
  })

  it('answers the plan scope the seat is rooted in, which is the only scope there is', async () => {
    holdingStoredSeat(api, atlasPlan(), MANAGE_SEAT_TOKEN)
    const share = await readShare(MANAGE_SEAT_TOKEN)
    expect(share.ok && share.value.scope).toEqual({ kind: 'plan', planId: PLAN_A })
    expect(share.ok && share.value.plan).toEqual({ id: PLAN_A, name: 'Atlas rollout' })
  })

  it('carries no token of its own, so the answer a page renders from holds none', async () => {
    holdingStoredSeat(api, atlasPlan(), MANAGE_SEAT_TOKEN)
    const share = await readShare(MANAGE_SEAT_TOKEN)
    expect(JSON.stringify(share)).not.toContain(MANAGE_SEAT_TOKEN)
  })

  it('redirects on the 404 a token that holds no seat is answered, where linkRead would 404 the page', async () => {
    holdingSeat(api, PLAN_A, 'view', REVOKED_SEAT_TOKEN)
    expect(await redirectOf(readShare(REVOKED_SEAT_TOKEN))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('comes back as a sentence for any other refusal, rather than redirecting on that too', async () => {
    api.answers.set(currentShareKey(), () => problemAnswer(500, 'The plan store is busy.'))
    expect(await readShare(SEAT_TOKEN)).toMatchObject({ ok: false, status: 500 })
  })
})

describe('the plan read that follows it', () => {
  it('reads the whole plan under the same token, id given by the bootstrap', async () => {
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    const plan = await readSeatPlan(SEAT_TOKEN, PLAN_A)
    expect(plan).toMatchObject({ ok: true, value: { name: 'Atlas rollout' } })
    expect(plan.ok && plan.value.schedule.spans.length).toBe(5)
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${SEAT_TOKEN}`])
  })

  it('drops the seats the API hands a manage holder, which it really does hand over', async () => {
    holdingStoredSeat(api, atlasPlan(), MANAGE_SEAT_TOKEN)
    const plan = await readSeatPlan(MANAGE_SEAT_TOKEN, PLAN_A)
    expect(bodiesWith(SEAT_TOKEN)).toHaveLength(1)
    expect(Object.keys(plan.ok ? plan.value : {})).not.toContain('shareLinks')
    expect(JSON.stringify(plan)).not.toContain(SEAT_TOKEN)
    expect(JSON.stringify(plan)).not.toContain(MANAGE_SEAT_TOKEN)
  })

  it('hands back exactly the document the API answered, for a seat refused the block', async () => {
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    const plan = await readSeatPlan(SEAT_TOKEN, PLAN_A)
    expect(bodiesWith(SEAT_TOKEN)).toEqual([])
    expect(plan.ok && plan.value).toEqual(answered[0])
  })

  it('renders not-found for a plan the API no longer holds', async () => {
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(404, 'No such plan'))
    expect(await thrownBy(readSeatPlan(SEAT_TOKEN, PLAN_A))).toBeInstanceOf(NotFound)
  })

  it('renders not-found for the 422 an id that is not a ULID is answered', async () => {
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(422, 'planId: must be a ULID'))
    expect(await thrownBy(readSeatPlan(SEAT_TOKEN, PLAN_A))).toBeInstanceOf(NotFound)
  })

  it('goes to the terminal page when the link died between the two reads', async () => {
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(401))
    expect(await redirectOf(readSeatPlan(SEAT_TOKEN, PLAN_A))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('presents the seat’s token and never an admin bearer, whatever else this process holds', async () => {
    holdingAdmin(api)
    holdingStoredSeat(api, atlasPlan(), SEAT_TOKEN)
    await readSeatPlan(SEAT_TOKEN, PLAN_A)
    expect(api.received.every((one) => one.bearer !== ADMIN_TOKEN)).toBe(true)
  })
})
