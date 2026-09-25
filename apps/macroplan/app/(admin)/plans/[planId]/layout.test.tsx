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
  createPlanSeat,
  readPlanSeats,
  revokePlanSeat,
  updatePlanSeat,
} from '../../../../actions/plan-share-links'
import { ADMIN_PLAN_ACTIONS } from '../../../../components/plan/admin-actions'
import { handedBy, tokensHandedBy } from '../../../../components/plan/testing/handed'
import {
  ADMIN_TOKEN,
  atlasPlan,
  FEATURE_1,
  ITEM_3,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  PLAN_B,
  PLAN_GONE,
  SEAT_TOKEN,
  tangledPlan,
  WRITE_SEAT_TOKEN,
} from '../../../../components/plan/testing/plan-fixture'
import { featurePath, itemPath } from '../../../../lib/drawer-routes'
import { payloadOf } from '../../../../lib/principal'
import { ACTION_REFUSALS } from '../../../../lib/refusal'

// The four seat actions by the names reflection can see, taken from the functions themselves so a rename
// cannot leave this list standing. They are what the share manager is handed, and the sweep below requires
// every function this layout hands over to be one of these or one of the eighteen writes.
const SEAT_ACTIONS = [readPlanSeats, createPlanSeat, updatePlanSeat, revokePlanSeat].map(
  (action) => action.name,
)

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
// The conflict list this layout fills its slot with closes every row with links, and Next's own `Link`
// wants a router this render has none of. The shared double forwards `className` and `href` and is what
// every other file in this app mocks with, so three copies of one anchor cannot drift.
vi.mock('next/link', async () => ({
  default: (await import('../../../../components/plan/testing/next-link')).LinkDouble,
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

// The walk itself lives in `components/plan/testing/handed.ts`, which is also where what it can and
// cannot see is written out — three surfaces run it and each carried its own copy before that, which
// is the last thing a leak sweep should be able to drift in.
//
// It guards this file because **the read moved here**: the layout is what hands a plan to a component,
// and a sweep left behind on a page that reads none would pass by having nothing to look at. Each
// drawer page keeps its own copy of the assertions, for the same reason in reverse.
const tokensFrom = (element: ReactNode): readonly string[] => tokensHandedBy(element, EVERY_TOKEN)

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

  // The list is filled **here** and not inside `PlanScreen`, because every link in it addresses this
  // surface's own drawer routes and `/s/<token>` renders the same screen. So this is the file that has
  // to prove the slot is filled, and that the two builders in `lib/drawer-routes.ts` are what filled
  // it — a feature and an item, which are two different pages.
  it('draws the plan’s own contradictions, each linked to the drawer that would fix it', async () => {
    holdingAdmin(api)
    api.plans = [tangledPlan()]
    await show()
    const list = screen.getByRole('region', { name: 'How this plan contradicts itself' })
    expect(list.querySelectorAll('[data-slot="conflict-row"]').length).toBeGreaterThan(2)
    expect(screen.getAllByRole('link', { name: 'Auth rewrite' })[0]?.getAttribute('href')).toBe(
      featurePath(PLAN_A, FEATURE_1),
    )
    expect(screen.getAllByRole('link', { name: 'Invoices' })[0]?.getAttribute('href')).toBe(
      itemPath(PLAN_A, ITEM_3),
    )
  })

  it('draws no such list for a plan that contradicts itself in none of the three ways', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(document.querySelector('[data-slot="conflict-list"]')).toBeNull()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
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

  // Seven props now: the conflict list and the share manager are both built here rather than passed
  // through, and for the same kind of reason — the seat surface renders the same screen, may not carry
  // links into this one's drawer routes, and may not present this one's cookie. So filling either is this
  // file's own decision and belongs in this file's assertions. The drawer stays identity-compared, being
  // `children` and not built here.
  it('hands the screen both slots it builds, the writes and the three props it had', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    const element = await PlanLayout(propsOf(PLAN_A))
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(Object.keys(handed).sort()).toEqual([
      'actions',
      'at',
      'conflicts',
      'controls',
      'drawer',
      'plan',
      'share',
    ])
    expect(handed['drawer']).toBe(DRAWER)
    expect(handed['actions']).toBe(ADMIN_PLAN_ACTIONS)
    expect(isValidElement<{ plan: unknown }>(handed['conflicts'])).toBe(true)
  })

  // The manager is handed the plan's id and the four seat answers as flat primitives, and its four actions
  // as module functions — never a seat, a count or a token, which is what the sweep further down asserts by
  // shape. The id is the API's own rather than the URL's, so it is the plan this screen is drawing.
  it('builds the share manager on the plan the API confirmed, with the four seat answers spread', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    const element = await PlanLayout(propsOf(PLAN_A))
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    const share = handed['share']
    const props = isValidElement<Record<string, unknown>>(share) ? share.props : {}
    expect(props['planId']).toBe(PLAN_A)
    expect(props['mayRead']).toBe(true)
    expect(props['mayCreate']).toBe(true)
    expect(props['mayUpdate']).toBe(true)
    expect(props['mayRevoke']).toBe(true)
    expect(Object.values(props).filter((one) => typeof one === 'function')).toHaveLength(4)
  })

  it('builds that list from the very plan it hands the screen, never from a second read', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    const element = await PlanLayout(propsOf(PLAN_A))
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    const conflicts = handed['conflicts']
    const list = isValidElement<{ plan: unknown }>(conflicts) ? conflicts.props.plan : null
    expect(list).toBe(handed['plan'])
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
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
    expect(tokensFrom(planted)).toHaveLength(3)
    expect(tokensFrom(<p>Atlas rollout</p>)).toEqual([])
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
    expect(tokensFrom(element)).toEqual([])
    for (const token of EVERY_TOKEN) expect(container.innerHTML).not.toContain(token)
  })

  it('hands a plan whose seats were dropped on the server, not merely one nothing rendered', async () => {
    const element = await shown()
    const plan = isValidElement<{ plan: object }>(element) ? element.props.plan : undefined
    expect(plan).toBeTruthy()
    expect(Object.keys(plan ?? {})).not.toContain('shareLinks')
  })

  // This case was "hands over no function at all", and `handed.ts` set out what the first surface to hand
  // one over owes: every function must be a module action imported by name, since reflection can see all
  // there is to see of one, where a **bound** action could carry a token invisibly —
  // `action.bind(null, token)` exposes neither the token nor a name of its own, and
  // `Function.prototype.bind` names its result `bound <name>`. The canvas's drag is what made this layout
  // hand the screen the writes, so the assertion becomes the drawer pages': exactly the eighteen, each
  // named, none bound and none anonymous. Nothing is relaxed — the empty list only ever stood because
  // there was no write on this surface to hand over.
  it('hands over the eighteen writes and nothing bound, so no token hides in an action’s arguments', async () => {
    const handed = handedBy(await shown())
    expect([...handed.functions].sort()).toEqual([...Object.keys(ADMIN_PLAN_ACTIONS), ...SEAT_ACTIONS].sort())
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
    expect(handed.functions.filter((name) => name === '')).toEqual([])
  })
})
