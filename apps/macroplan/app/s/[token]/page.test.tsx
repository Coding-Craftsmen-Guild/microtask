import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentShareKey,
  fakePlanApiState,
  fakePlanFetch,
  holdingSeat,
  planReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../../components/plan/testing/fake-plan-api'
import {
  atlasPlan,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  REVOKED_SEAT_TOKEN,
  SEAT_TOKEN,
  WRITE_SEAT_TOKEN,
} from '../../../components/plan/testing/plan-fixture'
import { SERVICE_UNAVAILABLE } from '../../../lib/problem'
import { ACTION_REFUSALS } from '../../../lib/refusal'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

// next/headers is mocked to **throw**, which is the assertion: a `/s/*` page authenticates from its
// own URL, so a cookie or a header read anywhere under it — by the page, by `apiForLink`, by anything
// they call — fails this whole file rather than passing quietly. `mp_admin` on the same browser
// therefore cannot lend a seat's page anything, because the page cannot see it (ADR 0040).
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a seat page must not read a cookie')
  },
  headers: () => {
    throw new Error('a seat page must not read a header')
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

const NOT_A_TOKEN = 'not-a-token'

const NOT_A_ULID = 'not-a-ulid'

let api: FakePlanApiState

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakePlanApiState()
  api.plans = [atlasPlan()]
  vi.stubGlobal('fetch', fakePlanFetch(api))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const { default: LinkPlanPage, generateMetadata } = await import('./page')

const props = (token: string) => ({ params: Promise.resolve({ token }) })

const seated = (token: string): string => {
  const stored = atlasPlan().shareLinks.find((seat) => seat.token === token)
  if (stored === undefined) throw new Error(`the fixture holds no seat ${token}`)
  holdingSeat(api, PLAN_A, stored.role, token)
  return token
}

const show = async (token = SEAT_TOKEN) => render(await LinkPlanPage(props(token)))

const thrownBy = async (token: string): Promise<unknown> => {
  try {
    await LinkPlanPage(props(token))
  } catch (error) {
    return error
  }
  throw new Error('nothing was thrown')
}

const redirectOf = async (token: string): Promise<string> => {
  const thrown = await thrownBy(token)
  if (thrown instanceof Redirected) return thrown.location
  throw new Error(`expected a redirect, got ${String(thrown)}`)
}

// Every token this test world can produce, read off the fixture rather than listed here: the fake
// API mints none of its own, so the manifest's seats plus the revoked one are exhaustively the
// token-shaped strings a leak could hand over. That is how a token is recognised below, because
// `ShareToken` is /^[A-Za-z0-9_-]{16,64}$/ with **no prefix** to match on — and a ULID satisfies
// that regexp too, so a shape test would demand every plan id be the visitor's own token. A set
// taken from the fixture cannot miss a real token and cannot mistake an id for one.
const EVERY_TOKEN = [...atlasPlan().shareLinks.map((seat) => seat.token), REVOKED_SEAT_TOKEN]

const stringsIn = (value: unknown, visited = new WeakSet<object>()): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function' || typeof value !== 'object' || value === null) return []
  if (visited.has(value)) return []
  visited.add(value)
  const node = isValidElement(value) ? (value.props as object) : value
  return Object.values(node).flatMap((child: unknown) => stringsIn(child, visited))
}

const tokensHandedBy = (element: ReactNode): string[] =>
  stringsIn(element).filter((one) => EVERY_TOKEN.some((token) => one.includes(token)))

describe('a plan seat lands on the one plan its token opens', () => {
  it('asks what the token reaches, then reads that plan, both under the URL token', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(trace(api)).toEqual([
      `${currentShareKey()} ${SEAT_TOKEN}`,
      `${planReadKey(PLAN_A)} ${SEAT_TOKEN}`,
    ])
  })

  it('reads the plan the bootstrap named, never an id from the URL', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(trace(api).at(-1)).toBe(`${planReadKey(PLAN_A)} ${SEAT_TOKEN}`)
    expect(api.received.every((one) => !one.path.includes(NOT_A_ULID))).toBe(true)
  })

  it.each([SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN])(
    'draws the same screen the admin page draws, for the seat holding %s',
    async (token) => {
      seated(token)
      await show(token)
      expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
      expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
      expect(document.querySelectorAll('[data-slot="feature-bar"]')).toHaveLength(2)
      expect(document.querySelectorAll('[data-slot="item-mark"]')).toHaveLength(3)
      expect(screen.getByText('starts 2026-09-28 · 14-day sprints · Europe/Belgrade')).toBeTruthy()
    },
  )

  it('draws the table beside it, so the plan is readable without the picture', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Table' })).toBeTruthy()
  })
})

describe('the token in this URL is the only authority the page has', () => {
  it('cannot read a cookie or a header at all, which is what the mock proves', async () => {
    const { cookies, headers } = await import('next/headers')
    expect(() => cookies()).toThrow()
    expect(() => headers()).toThrow()
  })

  it.each([SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN])(
    'sends %s as the bearer of every request it makes, and reads nothing else',
    async (token) => {
      seated(token)
      await show(token)
      expect(new Set(api.received.map((one) => one.bearer))).toEqual(new Set([token]))
    },
  )

  it('resolves the token in this URL, whichever link this browser opened before', async () => {
    seated(SEAT_TOKEN)
    seated(MANAGE_SEAT_TOKEN)
    await show(MANAGE_SEAT_TOKEN)
    expect(api.received.every((one) => one.bearer === MANAGE_SEAT_TOKEN)).toBe(true)
  })
})

describe('no seat is handed another seat’s token, however senior it is', () => {
  it('sees a token wherever one sits in a tree, which is what makes the sweep below mean something', () => {
    const planted: ReactNode = (
      <div data-seat={`seat ${WRITE_SEAT_TOKEN}`}>
        <p>{[MANAGE_SEAT_TOKEN]}</p>
      </div>
    )
    expect(tokensHandedBy(planted)).toHaveLength(2)
    expect(tokensHandedBy(<p>Atlas rollout</p>)).toEqual([])
  })

  it('hands nothing at all to a manage seat, the one role the API tells the plan’s other seats', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element: ReactNode = await LinkPlanPage(props(MANAGE_SEAT_TOKEN))
    const { container } = render(element)
    const handed = tokensHandedBy(element)
    expect(handed.filter((one) => !one.includes(MANAGE_SEAT_TOKEN))).toEqual([])
    expect(handed).toEqual([])
    for (const token of EVERY_TOKEN) expect(container.innerHTML).not.toContain(token)
  })

  it('renders from a plan whose seats were dropped on the server, not merely unrendered', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element = await LinkPlanPage(props(MANAGE_SEAT_TOKEN))
    const plan = isValidElement<{ plan: { shareLinks?: unknown } }>(element)
      ? element.props.plan
      : undefined
    expect(plan).toBeTruthy()
    expect(Object.keys(plan ?? {})).not.toContain('shareLinks')
  })
})

describe('a share link that no longer resolves', () => {
  it('goes to the terminal page for a segment that cannot be a token, having made no request', async () => {
    expect(await redirectOf(NOT_A_TOKEN)).toBe(LINK_UNAVAILABLE_PATH)
    expect(trace(api)).toEqual([])
  })

  it('goes to the terminal page on a 401, which is what a revoked or unknown token is answered', async () => {
    expect(await redirectOf(SEAT_TOKEN)).toBe(LINK_UNAVAILABLE_PATH)
    expect(trace(api)).toEqual([`${currentShareKey()} ${SEAT_TOKEN}`])
  })

  it('goes to the terminal page when the seat is gone between resolving the token and reading it back', async () => {
    holdingSeat(api, PLAN_A, 'view', REVOKED_SEAT_TOKEN)
    expect(await redirectOf(REVOKED_SEAT_TOKEN)).toBe(LINK_UNAVAILABLE_PATH)
    expect(trace(api)).toEqual([`${currentShareKey()} ${REVOKED_SEAT_TOKEN}`])
  })

  it('never answers any of the three with the admin password form', async () => {
    holdingSeat(api, PLAN_A, 'view', REVOKED_SEAT_TOKEN)
    const where = [
      await redirectOf(NOT_A_TOKEN),
      await redirectOf(WRITE_SEAT_TOKEN),
      await redirectOf(REVOKED_SEAT_TOKEN),
    ]
    expect(where).toEqual([LINK_UNAVAILABLE_PATH, LINK_UNAVAILABLE_PATH, LINK_UNAVAILABLE_PATH])
    expect(where.some((one) => one.startsWith('/login'))).toBe(false)
  })
})

describe('a plan the API no longer holds', () => {
  it('renders not-found when the plan was deleted between the bootstrap and the read', async () => {
    seated(SEAT_TOKEN)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(404, 'No such plan'))
    expect(await thrownBy(SEAT_TOKEN)).toBeInstanceOf(NotFound)
  })

  it('renders not-found for the 422 an id that is not a ULID is answered, which no URL here can cause', async () => {
    seated(SEAT_TOKEN)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(422, 'planId: must be a ULID'))
    expect(await thrownBy(SEAT_TOKEN)).toBeInstanceOf(NotFound)
  })
})

describe('every other refusal is said in place of the timeline', () => {
  it('says this surface’s own words for a refused plan, never the API’s', async () => {
    seated(SEAT_TOKEN)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    await show()
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.link.forbidden)
    expect(screen.queryByText(/plan:read/)).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('says so for a refused bootstrap too, rather than rendering a plan it never named', async () => {
    api.answers.set(currentShareKey(), () => problemAnswer(500, 'The plan store is busy.'))
    await show()
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.link.broken)
    expect(screen.queryByText('The plan store is busy.')).toBeNull()
    expect(trace(api)).toEqual([`${currentShareKey()} ${SEAT_TOKEN}`])
  })

  it('shows an unreachable API as that, and not as a dead link', async () => {
    api.answers.set(currentShareKey(), () => {
      throw new TypeError('fetch failed')
    })
    await show()
    expect(screen.getByText(SERVICE_UNAVAILABLE)).toBeTruthy()
  })
})

describe('generateMetadata', () => {
  it('titles the tab with the plan’s name from the bootstrap, reading no plan to do it', async () => {
    seated(SEAT_TOKEN)
    expect(await generateMetadata(props(SEAT_TOKEN))).toEqual({
      title: 'Atlas rollout · CC Guild Macroplan',
    })
    expect(trace(api)).toEqual([`${currentShareKey()} ${SEAT_TOKEN}`])
  })

  it('names no plan when the bootstrap was refused, rather than inventing one', async () => {
    api.answers.set(currentShareKey(), () => problemAnswer(403, 'Not permitted: plan:read'))
    expect(await generateMetadata(props(SEAT_TOKEN))).toEqual({
      title: 'Shared plan · CC Guild Macroplan',
    })
  })
})
