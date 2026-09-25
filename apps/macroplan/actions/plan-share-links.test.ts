import {
  createMacroplanAdminClient,
  planPath,
  type MacroplanSessionClient,
  type PlanSeatChange,
} from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMIN_TOKEN,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  SEAT_TOKEN,
  WRITE_SEAT_TOKEN,
  atlasPlan,
  type StoredPlan,
} from '../components/plan/testing/plan-fixture'
import { problemAnswer } from '../components/plan/testing/fake-plan-api'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { Redirected, redirectOf } from './testing/redirected'

// A fake of its own rather than `testing/recording-admin.ts`, and the reason is the three routes this
// file is about: that helper answers the **plan** to every request, which is right for the plan's writes
// that each answer a plan and wrong for a mint, whose response the real `PlanShareLink` schema parses.
// `testing/fake-plan-api.ts` cannot serve either — it answers 405 to every method but GET. So this one
// answers per method and path, through the real admin client, the real transport and the real schemas:
// what is asserted below is the wire, not that an action called the method it calls.
const BASE = 'http://api.test'

const SEATS = `${planPath(PLAN_A)}/share-links`

const seatPath = (token: string): string => `${SEATS}/${token}`

interface Asked {
  readonly method: string
  readonly path: string
  readonly body: unknown
}

const NOW = '2026-09-25T10:00:00.000Z'

const MINTED = 'a_minted_seats_token'

interface Seat {
  readonly token: string
  readonly name: string
  readonly role: 'view' | 'write' | 'manage'
  readonly createdBy: string | null
  readonly createdAt: string
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const storedSeat = (token: string): Seat => {
  const found = atlasPlan().shareLinks.find((seat) => seat.token === token)
  if (found === undefined) throw new Error(`the fixture holds no seat ${token}`)
  return found
}

const bodyOf = (body: unknown): Record<string, unknown> =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}

interface Fake {
  readonly asked: readonly Asked[]
  readonly api: MacroplanSessionClient
  refuse(status: number): void
}

// Answers the four routes these actions can reach, and 404s anything else — so an action addressed at a
// path this API does not serve fails rather than being answered leniently. Keyed on the bearer for the
// reason `recording-admin.ts` records: a request presenting any other credential is a 401.
const minted = (body: Record<string, unknown>): Response =>
  json(201, {
    token: MINTED,
    name: String(body['name'] ?? ''),
    role: body['role'] ?? 'view',
    createdBy: null,
    createdAt: NOW,
  })

const answerFor = (asked: Asked, plan: StoredPlan): Response => {
  const body = bodyOf(asked.body)
  if (asked.method === 'GET' && asked.path === planPath(PLAN_A)) return json(200, plan)
  if (asked.method === 'POST' && asked.path === SEATS) return minted(body)
  if (asked.method === 'PATCH' && asked.path === seatPath(MANAGE_SEAT_TOKEN)) {
    const stored = storedSeat(MANAGE_SEAT_TOKEN)
    return json(200, { ...stored, ...body, token: stored.token })
  }
  if (asked.method === 'DELETE' && asked.path === seatPath(MANAGE_SEAT_TOKEN)) {
    return new Response(null, { status: 204 })
  }
  return problemAnswer(404, 'Not found')
}

const fake = (plan: StoredPlan = atlasPlan()): Fake => {
  const asked: Asked[] = []
  const refusals: number[] = []
  const fetcher = (url: string, init: RequestInit): Promise<Response> => {
    const one: Asked = {
      method: init.method ?? 'GET',
      path: new URL(url).pathname,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    asked.push(one)
    const bearer = new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '')
    if (bearer !== ADMIN_TOKEN) return Promise.resolve(problemAnswer(401))
    const refused = refusals.shift()
    return Promise.resolve(
      refused === undefined ? answerFor(one, plan) : problemAnswer(refused),
    )
  }
  return {
    asked,
    api: createMacroplanAdminClient({ baseUrl: BASE, serviceKey: 'test-key', fetch: fetcher }, ADMIN_TOKEN),
    refuse: (status) => {
      refusals.push(status)
    },
  }
}

const held: { api: MacroplanSessionClient | null } = { api: null }
const refresh = vi.fn()
let api: Fake

vi.mock('../lib/api', () => ({ apiForSession: () => Promise.resolve(held.api) }))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const { createPlanSeat, readPlanSeats, revokePlanSeat, updatePlanSeat } = await import(
  './plan-share-links'
)

beforeEach(() => {
  api = fake()
  held.api = api.api
  refresh.mockReset()
})

describe('the seats a plan already carries', () => {
  it('reads them out of the plan itself, there being no seats endpoint to ask', async () => {
    await readPlanSeats(PLAN_A)
    expect(api.asked).toEqual([{ method: 'GET', path: planPath(PLAN_A), body: undefined }])
  })

  it('answers every seat the plan carries, token and all, which is what the manager opens to show', async () => {
    expect(await readPlanSeats(PLAN_A)).toEqual({ ok: true, value: atlasPlan().shareLinks })
    const answered = await readPlanSeats(PLAN_A)
    const tokens = answered.ok ? answered.value.map((seat) => seat.token) : []
    expect(tokens).toEqual([SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN])
  })

  it('answers an empty list where the block is absent, that being the only shape it can be refused in', async () => {
    const { shareLinks: withheld, ...rest } = atlasPlan()
    expect(withheld).toHaveLength(3)
    api = fake(rest as StoredPlan)
    held.api = api.api
    expect(await readPlanSeats(PLAN_A)).toEqual({ ok: true, value: [] })
  })

  it('says the admin surface’s own sentence when the API refuses the read', async () => {
    api.refuse(403)
    expect(await readPlanSeats(PLAN_A)).toEqual({
      ok: false,
      status: 403,
      detail: plainRefusal(403, ACTION_REFUSALS.admin),
    })
  })

  it('sends an expired admin back to the plan they were reading, never to the manager’s own URL', async () => {
    held.api = null
    expect(await redirectOf(readPlanSeats(PLAN_A))).toBe(`/login?next=%2Fplans%2F${PLAN_A}`)
    expect(api.asked).toEqual([])
  })
})

describe('minting a seat', () => {
  it('posts to the plan’s own share-links route with a name and a role and nothing else', async () => {
    await createPlanSeat(PLAN_A, { name: 'Pia', role: 'write' })
    expect(api.asked).toEqual([
      { method: 'POST', path: SEATS, body: { name: 'Pia', role: 'write' } },
    ])
  })

  it('answers the seat as minted, carrying the token that response is the only sight of', async () => {
    expect(await createPlanSeat(PLAN_A, { name: 'Pia', role: 'write' })).toEqual({
      ok: true,
      value: { token: MINTED, name: 'Pia', role: 'write', createdBy: null, createdAt: NOW },
    })
  })
})

describe('renaming a seat and re-roling it', () => {
  it('patches the seat’s own path, keeping the token its holder has bookmarked', async () => {
    await updatePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN, { name: 'Ravi at ACME' })
    await updatePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN, { role: 'view' })
    expect(api.asked.map((one) => ({ method: one.method, path: one.path, body: one.body }))).toEqual([
      { method: 'PATCH', path: seatPath(MANAGE_SEAT_TOKEN), body: { name: 'Ravi at ACME' } },
      { method: 'PATCH', path: seatPath(MANAGE_SEAT_TOKEN), body: { role: 'view' } },
    ])
    const answered = await updatePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN, { role: 'view' })
    expect(answered).toEqual({
      ok: true,
      value: { ...storedSeat(MANAGE_SEAT_TOKEN), role: 'view' },
    })
  })

  it('forwards name and role and drops whatever else arrived, an action being a public endpoint', async () => {
    const sent = { name: 'Ravi', role: 'view', token: 'a_forged_seats_tokn' } as PlanSeatChange
    await updatePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN, sent)
    expect(api.asked[0]?.body).toEqual({ name: 'Ravi', role: 'view' })
  })

  it('sends an empty change as an empty body and is answered 200, so the form is what must refuse one', async () => {
    expect(await updatePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN, {})).toEqual({
      ok: true,
      value: storedSeat(MANAGE_SEAT_TOKEN),
    })
    expect(api.asked).toEqual([
      { method: 'PATCH', path: seatPath(MANAGE_SEAT_TOKEN), body: {} },
    ])
  })
})

describe('revoking a seat', () => {
  it('deletes the seat’s own path and is answered nothing at all, the cascade being unreportable', async () => {
    expect(await revokePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN)).toEqual({ ok: true, value: undefined })
    expect(api.asked).toEqual([
      { method: 'DELETE', path: seatPath(MANAGE_SEAT_TOKEN), body: undefined },
    ])
  })

  it('says the admin sentence for a token this plan does not hold, which the API answers 404', async () => {
    expect(await revokePlanSeat(PLAN_A, SEAT_TOKEN)).toEqual({
      ok: false,
      status: 404,
      detail: plainRefusal(404, ACTION_REFUSALS.admin),
    })
  })
})

describe('what none of the four does', () => {
  it('never refreshes the page, nothing either plan surface renders being derived from a seat', async () => {
    await readPlanSeats(PLAN_A)
    await createPlanSeat(PLAN_A, { name: 'Pia', role: 'view' })
    await updatePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN, { role: 'write' })
    await revokePlanSeat(PLAN_A, MANAGE_SEAT_TOKEN)
    expect(api.asked).toHaveLength(4)
    expect(refresh).not.toHaveBeenCalled()
  })
})
