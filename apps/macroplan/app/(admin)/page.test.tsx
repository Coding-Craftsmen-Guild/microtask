import { render, screen } from '@testing-library/react'
import { seal } from '@repo/app-session/crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { payloadOf } from '../../lib/principal'
import { ACTION_REFUSALS } from '../../lib/refusal'
import { SERVICE_UNAVAILABLE } from '../../lib/problem'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  holdingSeat,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../components/plan/testing/fake-plan-api'
import {
  ADMIN_TOKEN,
  atlasPlan,
  beaconPlan,
  PLAN_A,
  PLAN_B,
  SEAT_TOKEN,
} from '../../components/plan/testing/plan-fixture'

const SECRET = 'a-cookie-secret-of-at-least-32-by'

const LIST = 'GET /v1/macroplan/plans'

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

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
    throw new Error('notFound')
  },
}))
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'data-testid': testId,
  }: {
    href: string
    children: ReactNode
    className?: string
    'data-testid'?: string
  }) => (
    <a className={className} data-testid={testId} href={href}>
      {children}
    </a>
  ),
}))

const { default: MacroplanPage, metadata } = await import('./page')

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

const show = async () => render(await MacroplanPage())

const redirectOf = async (): Promise<string> => {
  try {
    await MacroplanPage()
  } catch (error) {
    if (error instanceof Redirected) return error.location
    throw error
  }
  throw new Error('nothing redirected')
}

describe('the admin landing page', () => {
  it('names this product in the tab title', () => {
    expect(metadata.title).toBe('Macroplan · CC Guild')
  })

  it('reads the plan collection once, under the bearer the admin cookie carries', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan(), beaconPlan()]
    await show()
    expect(trace(api)).toEqual([`${LIST} ${ADMIN_TOKEN}`])
  })

  it('lists every plan the API answered with, most recently updated first', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan(), beaconPlan()]
    await show()
    expect(screen.getAllByTestId('plan-name').map((one) => one.textContent)).toEqual([
      'Atlas rollout',
      'Beacon migration',
    ])
    expect(screen.getAllByTestId('plan-name').map((one) => one.getAttribute('href'))).toEqual([
      `/plans/${PLAN_A}`,
      `/plans/${PLAN_B}`,
    ])
  })

  it('carries the seat count an admin is told, and no plan contents at all', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByTestId('plan-counts').textContent).toBe(
      '1 epic · 2 features · 3 items · 2 share links',
    )
    expect(screen.queryByText(SEAT_TOKEN)).toBeNull()
    expect(screen.queryByText('Auth rewrite')).toBeNull()
  })

  it('says there are no plans yet, for a workspace that holds none', async () => {
    holdingAdmin(api)
    await show()
    expect(screen.getByText('No plans yet — there is nothing to open.')).toBeTruthy()
    expect(trace(api)).toEqual([`${LIST} ${ADMIN_TOKEN}`])
  })

  it('says a refusal in place of the list, in this surface’s words and never the API’s', async () => {
    holdingAdmin(api)
    api.answers.set(LIST, () => problemAnswer(403, 'Not permitted: workspace:list-plans'))
    await show()
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.admin.forbidden)
    expect(screen.queryByText(/workspace:list-plans/)).toBeNull()
  })

  it('says an unreachable API is unreachable, rather than sending the admin to sign in again', async () => {
    holdingAdmin(api)
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))
    await show()
    expect(screen.getByRole('alert').textContent).toBe(SERVICE_UNAVAILABLE)
  })

  it('sends a bearer the API no longer knows to sign in, with no ?next= for /', async () => {
    expect(await redirectOf()).toBe('/login')
    expect(trace(api)).toEqual([`${LIST} ${ADMIN_TOKEN}`])
  })

  it('sends a browser with no admin cookie to sign in without making a request at all', async () => {
    bearer = null
    expect(await redirectOf()).toBe('/login')
    expect(trace(api)).toEqual([])
  })

  it('refuses the collection to a seat token, because the state is keyed on the bearer', async () => {
    holdingSeat(api, PLAN_A, 'manage')
    api.plans = [atlasPlan()]
    bearer = SEAT_TOKEN
    await show()
    expect(trace(api)).toEqual([`${LIST} ${SEAT_TOKEN}`])
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.admin.forbidden)
  })
})
