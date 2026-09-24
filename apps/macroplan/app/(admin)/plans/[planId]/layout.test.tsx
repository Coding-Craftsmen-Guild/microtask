import { seal } from '@repo/app-session/crypto'
import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
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
  SEAT_TOKEN,
  WRITE_SEAT_TOKEN,
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

const { default: PlanLayout, generateMetadata } = await import('./layout')

let api: FakePlanApiState

// Every answer body the fake put on the wire, as read-share.test.ts collects them: it is what lets
// "the layout hands over no token" be checked against what the API actually served rather than
// against an assumption that it served one.
const answered: unknown[] = []

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  api = fakePlanApiState()
  answered.length = 0
  const fake = fakePlanFetch(api)
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const answer = await fake(url, init)
    answered.push(await answer.clone().json())
    return answer
  })
  bearer = ADMIN_TOKEN
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const DRAWER: ReactNode = <p data-testid="drawer-slot">the drawer slot</p>

const paramsOf = (planId: string) => ({ params: Promise.resolve({ planId }) })

const propsOf = (planId: string) => ({ ...paramsOf(planId), children: DRAWER })

const show = async (planId = PLAN_A) => render(await PlanLayout(propsOf(planId)))

const thrownBy = async (planId: string): Promise<unknown> => {
  try {
    await PlanLayout(propsOf(planId))
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

// Every token this test world holds, read off the fixture rather than listed here, so the sweep
// cannot miss one a seat was added with. `ShareToken` admits sixteen to sixty-four url-safe
// characters with no prefix, and a ULID satisfies it too, so recognising a token by shape would
// demand every plan id be a leak.
const EVERY_TOKEN = atlasPlan().shareLinks.map((seat) => seat.token)

interface Handed {
  readonly strings: string[]
  readonly functions: string[]
}

// Ported from this segment's page.test.tsx, where it guarded the surface that read the plan. It
// guards this file now because **the read moved here**: the layout is what hands a plan to a
// component, and a sweep left behind on a page that reads none would pass by having nothing to look
// at. The page keeps its own copy of the last assertion, for the same reason in reverse.
//
// 1. `key`. React moves it out of `props` onto `element.key`, so `<div key={token}>` is invisible to
//    a walk that descends into `props` alone — and React does serialise keys into the Flight
//    payload. `keysOf` reads it off the element, and the self-test below plants one.
// 2. Functions. A bound argument is unreachable by reflection: `action.bind(null, token)` exposes
//    neither the token nor its own name, so no walk can see inside one, and that is exactly the
//    mechanism ADR 0040 describes for handing a token to a component. What is checkable is whether
//    the layout hands over a function **at all**, so every function met is recorded and asserted
//    empty. Phase 3's first bound server action therefore fails that assertion rather than passing
//    it quietly, and whoever adds it has to say how its arguments are proved clean. The drawer this
//    task added binds nothing — each drawer page is a Server Component reading its own route params
//    and drawing words the row already decided — so the assertion stays at zero here and on
//    `/s/<token>`, and reading a bound function's arguments is still owed by whoever binds one.
const keysOf = (value: object): readonly string[] =>
  isValidElement(value) && typeof value.key === 'string' ? [value.key] : []

const childrenOf = (value: object): readonly unknown[] =>
  Object.values(isValidElement(value) ? (value.props as object) : value)

const sweep = (value: unknown, found: Handed, seen: WeakSet<object>): void => {
  if (typeof value === 'string') {
    found.strings.push(value)
    return
  }
  if (typeof value === 'function') {
    found.functions.push(value.name)
    return
  }
  if (typeof value !== 'object' || value === null || seen.has(value)) return
  seen.add(value)
  found.strings.push(...keysOf(value))
  for (const child of childrenOf(value)) sweep(child, found, seen)
}

const handedBy = (element: ReactNode): Handed => {
  const found: Handed = { strings: [], functions: [] }
  sweep(element, found, new WeakSet())
  return found
}

const tokensHandedBy = (element: ReactNode): readonly string[] =>
  handedBy(element).strings.filter((one) => EVERY_TOKEN.some((token) => one.includes(token)))

describe('the plan layout', () => {
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

  it('heads the page with the plan’s name as a real heading, not merely as text', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
  })

  it('says how the plan is timed, which is what its whole axis is derived from', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByText('starts 2026-09-28 · 14-day sprints · Europe/Belgrade')).toBeTruthy()
  })

  it('titles the tab with the plan’s own name, through the same cached read it renders from', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    expect((await generateMetadata(paramsOf(PLAN_A))).title).toBe(
      'Atlas rollout · CC Guild Macroplan',
    )
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
  })

  it('titles the tab without the plan’s name when the read was refused, rather than leaking one', async () => {
    holdingAdmin(api)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    expect((await generateMetadata(paramsOf(PLAN_A))).title).toBe('Plan · CC Guild Macroplan')
  })

  it('owns the title for every page under it, which is why the page no longer exports one', async () => {
    const page: Record<string, unknown> = await import('./page')
    expect(Object.keys(page)).not.toContain('generateMetadata')
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

describe('the drawer is a slot beside the canvas, and the canvas is the layout’s', () => {
  it('draws whatever is routed into it beside the timeline and the table, not instead of them', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByTestId('drawer-slot')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(screen.getByRole('table', { name: 'Table of Atlas rollout' })).toBeTruthy()
  })

  it('hands the screen that slot and the three props it had, and nothing else', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    const element = await PlanLayout(propsOf(PLAN_A))
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(Object.keys(handed).sort()).toEqual(['at', 'controls', 'drawer', 'plan'])
    expect(handed['drawer']).toBe(DRAWER)
  })

  it('draws no slot at all when it could not read the plan, so one refusal is said once', async () => {
    holdingAdmin(api)
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    await show()
    expect(screen.queryByTestId('drawer-slot')).toBeNull()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})

describe('the plan layout hands no share token to a component, however senior the caller', () => {
  const shown = async (): Promise<ReactNode> => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    return await PlanLayout(propsOf(PLAN_A))
  }

  it('reads three live tokens off the fixture, so “none of them” is not a claim about an empty set', () => {
    expect(EVERY_TOKEN).toHaveLength(3)
    expect(EVERY_TOKEN).toEqual([SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN])
  })

  it('sees a token wherever one can hide — a prop, a child, and a key', () => {
    const planted: ReactNode = (
      <div data-seat={`seat ${WRITE_SEAT_TOKEN}`}>
        <p key={SEAT_TOKEN}>{[MANAGE_SEAT_TOKEN]}</p>
      </div>
    )
    expect(tokensHandedBy(planted)).toHaveLength(3)
    expect(tokensHandedBy(<p>Atlas rollout</p>)).toEqual([])
  })

  it('sees a function planted where a bound action would sit, so “none at all” is checkable', () => {
    const write = async (token: string): Promise<void> => {
      await Promise.resolve(token)
    }
    const planted: ReactNode = <form action={write.bind(null, SEAT_TOKEN)} />
    expect(handedBy(planted).functions).toHaveLength(1)
  })

  it('was answered all three on the wire, so what follows is a reduction and not a thin plan', async () => {
    await shown()
    const wire = JSON.stringify(answered)
    for (const token of EVERY_TOKEN) expect(wire).toContain(token)
  })

  it('hands not one of them to a component, and renders none of them', async () => {
    const element = await shown()
    const { container } = render(element)
    expect(tokensHandedBy(element)).toEqual([])
    for (const token of EVERY_TOKEN) expect(container.innerHTML).not.toContain(token)
  })

  it('hands a plan whose seats were dropped on the server, not merely one nothing rendered', async () => {
    const element = await shown()
    const plan = isValidElement<{ plan: object }>(element) ? element.props.plan : undefined
    expect(plan).toBeTruthy()
    expect(Object.keys(plan ?? {})).not.toContain('shareLinks')
  })

  it('hands over no function at all, so no token is hiding in a bound action’s arguments', async () => {
    expect(handedBy(await shown()).functions).toEqual([])
  })
})
