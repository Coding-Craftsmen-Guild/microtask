import { planPath } from '@repo/api-client'
import { seal } from '@repo/app-session/crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  holdingSeat,
  itemReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../components/plan/testing/fake-plan-api'
import { ADMIN_TOKEN, EPIC_1, ITEM_1, PLAN_A, SEAT_TOKEN, atlasPlan } from '../components/plan/testing/plan-fixture'
import { payloadOf } from '../lib/principal'

const SECRET = 'a-cookie-secret-of-at-least-32-by'

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: () => ({ name: 'mp_admin', value: seal(SECRET, payloadOf({ kind: 'admin', token: ADMIN_TOKEN })) }),
      set: () => undefined,
    }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`)
  },
  notFound: () => {
    throw new Error('notFound')
  },
}))

const { readItemDrawer, seatReadItemDrawer } = await import('./drawer-reads')

const TASKS = `GET ${planPath(PLAN_A)}/bridge/epics/${EPIC_1}/tasks`

let api: FakePlanApiState

const json = (body: unknown): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  api = fakePlanApiState()
  api.plans = [atlasPlan()]
  api.descriptions.set(ITEM_1, 'Log in with a passkey')
  vi.stubGlobal('fetch', fakePlanFetch(api))
  holdingAdmin(api)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('what an item drawer reads when it opens, which the plan does not carry', () => {
  it('answers the description out of the item’s own file, and the tasks of its rail’s project', async () => {
    api.answers.set(TASKS, () => json({ tasks: [{ id: '01MPTTTTTTTTTTTTTTTTTTTTT1', name: 'Passkeys' }] }))
    expect(await readItemDrawer(PLAN_A, ITEM_1, EPIC_1)).toEqual({
      ok: true,
      value: { description: 'Log in with a passkey', tasks: { tasks: [{ id: '01MPTTTTTTTTTTTTTTTTTTTTT1', name: 'Passkeys' }] } },
    })
  })

  it('asks for no tasks for an item whose rail it could not name', async () => {
    expect(await readItemDrawer(PLAN_A, ITEM_1, null)).toMatchObject({ ok: true, value: { tasks: null } })
    expect(trace(api).some((line) => line.includes('/tasks'))).toBe(false)
  })

  it('answers no tasks, and still the description, when the rail is bound to nothing', async () => {
    api.answers.set(TASKS, () => problemAnswer(409))
    expect(await readItemDrawer(PLAN_A, ITEM_1, EPIC_1)).toEqual({
      ok: true,
      value: { description: 'Log in with a passkey', tasks: null },
    })
  })

  it('answers a refused item read as a refusal, rather than as a page that is not there', async () => {
    api.answers.set(itemReadKey(PLAN_A, ITEM_1), () => problemAnswer(404))
    expect(await readItemDrawer(PLAN_A, ITEM_1, EPIC_1)).toMatchObject({ ok: false, status: 404 })
  })

  it('reads a seat’s item through the seat’s own token, and never its project’s tasks', async () => {
    holdingSeat(api, PLAN_A, 'write')
    expect(await seatReadItemDrawer(SEAT_TOKEN, PLAN_A, ITEM_1)).toEqual({
      ok: true,
      value: { description: 'Log in with a passkey', tasks: null },
    })
    expect(trace(api)).toEqual([`GET ${planPath(PLAN_A)}/items/${ITEM_1} ${SEAT_TOKEN}`])
  })
})
