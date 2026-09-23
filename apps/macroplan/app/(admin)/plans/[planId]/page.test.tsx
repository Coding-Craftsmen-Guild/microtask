import { seal } from '@repo/app-session/crypto'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  holdingSeat,
  planReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../../../components/plan/testing/fake-plan-api'
import {
  ADMIN_TOKEN,
  atlasPlan,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  PLAN_B,
  PLAN_GONE,
} from '../../../../components/plan/testing/plan-fixture'
import { payloadOf } from '../../../../lib/principal'
import { ACTION_REFUSALS } from '../../../../lib/refusal'

const SECRET = 'a-cookie-secret-of-at-least-32-by'

const NOT_A_ULID = 'not-a-ulid'

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

class NotFound extends Error {}

let bearer: string | null = ADMIN_TOKEN

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: () =>
        bearer === null
          ? undefined
          : { name: 'mp_admin', value: seal(SECRET, payloadOf({ kind: 'admin', token: bearer })) },
      set: () => undefined,
    }),
  headers: () => Promise.resolve(new Headers()),
}))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  notFound: () => {
    throw new NotFound('notFound')
  },
}))
vi.mock('next/link', async () => ({
  default: (await import('../../../../components/plan/testing/next-link')).LinkDouble,
}))

const { default: PlanPage, generateMetadata } = await import('./page')

let api: FakePlanApiState

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  api = fakePlanApiState()
  vi.stubGlobal('fetch', fakePlanFetch(api))
  bearer = ADMIN_TOKEN
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const paramsOf = (planId: string) => ({ params: Promise.resolve({ planId }) })

const show = async (planId = PLAN_A) => render(await PlanPage(paramsOf(planId)))

const thrownBy = async (planId: string): Promise<unknown> => {
  try {
    await PlanPage(paramsOf(planId))
  } catch (error) {
    return error
  }
  throw new Error('nothing was thrown')
}

const redirectOf = async (planId: string): Promise<string> => {
  const thrown = await thrownBy(planId)
  if (thrown instanceof Redirected) return thrown.location
  throw new Error(`expected a redirect, got ${String(thrown)}`)
}

describe('the plan page', () => {
  it('reads the one plan under the bearer the admin cookie carries, and reads nothing else', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
  })

  it('draws the plan’s own timeline, named for the plan, with a bar per placed feature', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(document.querySelectorAll('[data-slot="feature-bar"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-slot="item-mark"]')).toHaveLength(3)
  })

  it('says how the plan is timed, which is what its whole axis is derived from', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByTestId('plan-name').textContent).toBe('Atlas rollout')
    expect(screen.getByTestId('plan-settings').textContent).toBe(
      'starts 2026-09-28 · 14-day sprints · Europe/Belgrade',
    )
  })

  it('carries no share token into the page, however senior the caller', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    const { container } = await show()
    expect(container.textContent).not.toContain('a_plan_seats_token1')
    expect(container.textContent).not.toContain('a_manage_seats_tok1')
  })

  it('titles the tab with the plan’s own name, read through the same cached function the page uses', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    expect((await generateMetadata(paramsOf(PLAN_A))).title).toBe('Atlas rollout · CC Guild Macroplan')
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
  })

  it('titles the tab without the plan’s name when the read was refused, rather than leaking one', async () => {
    holdingAdmin(api)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    expect((await generateMetadata(paramsOf(PLAN_A))).title).toBe('Plan · CC Guild Macroplan')
  })

  it('renders not-found for a plan the workspace does not hold, rather than a sentence', async () => {
    holdingAdmin(api)
    expect(await thrownBy(PLAN_GONE)).toBeInstanceOf(NotFound)
  })

  it('renders not-found for an id that is not a ULID, which is what a hand-typed URL produces', async () => {
    holdingAdmin(api)
    api.answers.set(planReadKey(NOT_A_ULID), () => problemAnswer(422, 'planId: must be a ULID'))
    expect(await thrownBy(NOT_A_ULID)).toBeInstanceOf(NotFound)
  })

  it('says a refusal in place of the timeline, in this surface’s words and never the API’s', async () => {
    holdingAdmin(api)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    await show()
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.admin.forbidden)
    expect(screen.queryByText(/plan:read/)).toBeNull()
  })

  it('sends an expired admin to sign in, carrying this plan’s own path as ?next=', async () => {
    expect(await redirectOf(PLAN_A)).toBe(`/login?next=%2Fplans%2F${PLAN_A}`)
  })

  it('makes no request at all for a browser with no admin cookie', async () => {
    bearer = null
    expect(await redirectOf(PLAN_A)).toBe(`/login?next=%2Fplans%2F${PLAN_A}`)
    expect(trace(api)).toEqual([])
  })

  it('refuses this plan to a seat rooted in another one, because the API is keyed on the bearer', async () => {
    api.plans = [atlasPlan()]
    holdingSeat(api, PLAN_B, 'manage', MANAGE_SEAT_TOKEN)
    bearer = MANAGE_SEAT_TOKEN
    await show()
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${MANAGE_SEAT_TOKEN}`])
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.admin.forbidden)
  })
})
