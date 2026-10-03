import { seal } from '@repo/app-session/crypto'
import { render, screen, within } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  holdingSeat,
  bridgeReadKey,
  planReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../../../components/plan/testing/fake-plan-api'
import { bindEpicProject } from '../../../../actions/bridge'
import { readItemDrawer } from '../../../../actions/drawer-reads'
import {
  ADMIN_OWN_WRITES,
  ADMIN_PLAN_ACTIONS,
  ADMIN_SEAT_ACTIONS,
} from '../../../../components/plan/admin-actions'
import { planAxis, ZOOM_WORDS } from '../../../../components/plan/canvas/zoom-view'
import { planScreenModel } from '../../../../components/plan/plan-screen-model'
import { handedBy, tokensHandedBy } from '../../../../components/plan/testing/handed'
import {
  ADMIN_TOKEN,
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  PLAN_B,
  PLAN_GONE,
  SEAT_TOKEN,
  tangledPlan,
  WRITE_SEAT_TOKEN,
} from '../../../../components/plan/testing/plan-fixture'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { featurePath, railPath } from '../../../../lib/drawer-routes'
import { payloadOf } from '../../../../lib/principal'
import { ACTION_REFUSALS } from '../../../../lib/refusal'
import { ZOOM_COOKIE } from '../../../../lib/zoom'

// Every function this layout hands the browser that is **not** a member of `PlanEditActions`, by the names
// reflection can see — so a rename cannot leave this list standing and a tenth cannot arrive unseen.
//
// The plan's own three and the four seat writes are what the head row's two menus are handed; they are
// not members of `PlanEditActions` and should not be, none of them writing anything *in* the plan. The
// other two are new with ADR 0069: the read an item's drawer makes when it opens, which used to be the
// item page's own server read, and the bind-by-project the rail drawer offers, which no seat may make.
//
// What is **not** here any more is as telling. The drawer-path builders were handed over as a record so
// that a component could not reach for the admin's pair on the seat surface; the surface is a value now
// (`surface`), and the browser picks the record from it. And the zoom is no Server Action at all.
const OFF_INTERFACE = [
  'renamePlan',
  'retimePlan',
  'deletePlan',
  'readPlanSeats',
  'createPlanSeat',
  'updatePlanSeat',
  'revokePlanSeat',
  readItemDrawer.name,
  bindEpicProject.name,
]

const SECRET = 'a-cookie-secret-of-at-least-32-by'

const NOT_A_ULID = 'not-a-ulid'

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

class NotFound extends Error {}

let bearer: string | null = ADMIN_TOKEN

// What `mp_zoom` holds, which is a separate question from who is reading: `readZoom` answers
// `Rung | null` and the layout picks the plan's own fit for the null. The jar below answers **by
// name** for that reason — one `get` that returned the session for every name handed `readZoom` a
// sealed blob, so the fallback was being exercised by accident rather than because a test asked for
// it, and a reader's stated rung could not be pinned at all.
let chosenZoom: string | null = null

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        if (name === ZOOM_COOKIE) {
          return chosenZoom === null ? undefined : { name, value: chosenZoom }
        }
        return bearer === null
          ? undefined
          : { name, value: seal(SECRET, payloadOf({ kind: 'admin', token: bearer })) }
      },
      set: () => undefined,
    }),
  headers: () => Promise.resolve(new Headers()),
}))
// The drawer is read off the address in the browser (`components/plan/app/plan-drawer.tsx`), through the
// two hooks Next keeps in step with `history.pushState`; here they read `window.location`, so a test that
// reloads into a drawer sets the address first.
vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
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
  chosenZoom = null
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const DRAWER: ReactNode = <p data-testid="drawer-slot">the drawer slot</p>

const paramsOf = (planId: string) => ({ params: Promise.resolve({ planId }) })

const propsOf = (planId: string) => ({ ...paramsOf(planId), children: DRAWER })

const show = async (planId = PLAN_A) => render(await PlanLayout(propsOf(planId)))

/** Every prop the layout hands `PlanApp`, which is everything that crosses into the browser. */
const handedTo = async (planId: string): Promise<Record<string, unknown>> => {
  const element = await PlanLayout(propsOf(planId))
  return isValidElement<Record<string, unknown>>(element) ? element.props : {}
}

const slot = (name: string): Element | null => document.querySelector(`[data-slot="${name}"]`)

/** The table mounts once the screen has painted (`components/plan/table/table-aside.tsx`), so it is awaited. */
const tableShown = async (): Promise<HTMLElement> => screen.findByRole('table', { name: 'Table of Atlas rollout' })

const trayPanel = (): HTMLElement => {
  const found = document.querySelector<HTMLElement>('[data-slot="unscheduled-tray"]')
  if (found === null) throw new Error('the layout drew no tray under the board')
  return found
}

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
  // **Two reads, and exactly two.** Phase 4 added the bridge, and it is a second request rather than
  // fields on the first for a reason ADR 0061 records: a plan may hold forty bindings, so folding them in
  // would put forty Microtask manifest reads on the path that draws the timeline. Both go out under the
  // same bearer, and nothing else does — a third entry here would mean a component had started fetching.
  it('reads the one plan and its bridge under the admin bearer, and reads nothing else', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(trace(api)).toEqual([
      `${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`,
      `${bridgeReadKey(PLAN_A)} ${ADMIN_TOKEN}`,
    ])
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

  // The tray is filled **here** and not inside `PlanScreen`, because every link in it addresses this
  // surface's own drawer routes and `/s/<token>` renders the same screen. So this is the file that has
  // to prove the slot is filled and that `ADMIN_DRAWER_ROUTES` is what filled it.
  //
  // This case was the conflict panel's — "each linked to the drawer that would fix it", of which the
  // linking survives and the panel does not. It listed every complaint the pass made, above the
  // timeline, one row per unsized item included; the tray lists **features with no bar** and sits
  // underneath, because a feature is the thing that has a bar and so the only thing whose absence from
  // the chart is worth a row of its own.
  it('lists the features the pass could not place under the board, each linked to its own drawer', async () => {
    holdingAdmin(api)
    api.plans = [tangledPlan()]
    await show()
    expect(trayPanel().querySelectorAll('[data-slot="tray-row"]')).toHaveLength(2)
    const rows = within(trayPanel())
    expect(rows.getByRole('link', { name: 'Auth rewrite' }).getAttribute('href')).toBe(
      featurePath(PLAN_A, FEATURE_1),
    )
    expect(rows.getByRole('link', { name: 'Billing' }).getAttribute('href')).toBe(
      featurePath(PLAN_A, FEATURE_2),
    )
  })

  // `Invoices` is the one item the tangled plan drags off the axis, and the old panel gave it a row of
  // its own beside the two features — which on the deployed plan is how thirty rows came to stand above
  // the timeline. It is counted on the feature that owns it now, so a plan whose items are mostly
  // unsized is four marks rather than thirty rows.
  // An item takes its timing from the feature it is under, so an item nobody sized is the ordinary
  // case and not a thing left undone. It gets no tray row, and it puts no mark on its feature either.
  it('says nothing at all about an unplaced item, which is the feature’s estimate to carry', async () => {
    holdingAdmin(api)
    api.plans = [tangledPlan()]
    await show()
    expect(within(trayPanel()).queryByText('Invoices')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Invoices' })).toBeNull()
    const dot = document.querySelector('[data-search="billing"] [data-slot="attention-dot"]')
    expect(dot?.getAttribute('title') ?? '').not.toContain('item')
  })

  it('lists nothing under the board for a plan whose every feature has a bar', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(document.querySelector('[data-slot="unscheduled-tray"]')).toBeNull()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
  })

  // Three facts and three elements, the separators between them being `aria-hidden` middots rather
  // than characters in a sentence: the line sits under the plan's name in the head now, so it is read
  // once as three pieces of calendar and never as prose.
  it('says how the plan is timed, which is what its whole axis is derived from', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByText('starts 2026-09-28')).toBeTruthy()
    expect(screen.getByText('14-day sprints')).toBeTruthy()
    expect(screen.getByText('Europe/Belgrade')).toBeTruthy()
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
    // Both reads go out, because the layout makes them concurrently: the refusal is discovered after
    // the bridge request has already left. That is the deliberate trade — the timeline is the hot path
    // and serialising the two would cost every successful load a second round trip — and it leaks
    // nothing, since the bridge route gates on plan:read and refuses this bearer for the same reason.
    expect(trace(api)).toEqual([
      `${planReadKey(PLAN_A)} ${MANAGE_SEAT_TOKEN}`,
      `${bridgeReadKey(PLAN_A)} ${MANAGE_SEAT_TOKEN}`,
    ])
    expect(screen.getByRole('alert').textContent).toBe(ACTION_REFUSALS.admin.forbidden)
  })
})

describe('what the layout hands the browser, and what the browser draws from it', () => {
  it('draws whatever is routed into it beside the timeline and the table, not instead of them', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(screen.getByTestId('drawer-slot')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
    expect(await tableShown()).toBeTruthy()
  })

  // Twelve props, and every one is a value the browser could not have worked out for itself: the plan and
  // the bridge, read here; the zoom, out of a cookie; the instant, so the server and the browser draw one
  // today line; the surface and what it may do; and the Server Actions it may call. The slots this list
  // used to be — the chips, the tray, the menus, the zoom control — are built in the browser now, from the
  // same plan, so an edit changes them in the frame it is made (ADR 0069).
  it('hands the browser the plan once, with the writes and what only the server can know', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    const handed = await handedTo(PLAN_A)
    expect(Object.keys(handed).sort()).toEqual([
      'actions',
      'at',
      'bindProject',
      'bridge',
      'children',
      'controls',
      'own',
      'plan',
      'readItem',
      'seats',
      'surface',
      'zoom',
    ])
    expect(handed['children']).toBe(DRAWER)
    expect(handed['actions']).toBe(ADMIN_PLAN_ACTIONS)
    expect(handed['own']).toBe(ADMIN_OWN_WRITES)
    expect(handed['seats']).toBe(ADMIN_SEAT_ACTIONS)
    expect(handed['readItem']).toBe(readItemDrawer)
    expect(handed['bindProject']).toBe(bindEpicProject)
    expect(handed['controls']).toBe(ADMIN_CONTROLS)
    expect(handed['surface']).toEqual({ kind: 'admin', planId: PLAN_A })
    expect(handed['plan']).toEqual(planScreenModel(atlasPlan()))
  })

  // A reload, a pasted link or Back: the address names a drawer, and the browser draws it from the plan
  // this layout already read, so a drawer costs the same two reads the plan does and not a third.
  it('opens the drawer the address names on a reload, from the two reads the plan was drawn from', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    window.history.replaceState(null, '', featurePath(PLAN_A, FEATURE_1))
    await show()
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(trace(api)).toEqual([
      `${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`,
      `${bridgeReadKey(PLAN_A)} ${ADMIN_TOKEN}`,
    ])
  })

  // Everything that acts on the whole plan is in the head row, and everything that acts on one thing in
  // it is on or beside that thing. What is in the head is the two menus and the chips, each drawn on what
  // this viewer may do rather than unconditionally.
  it('puts the whole-plan actions in the head, each on its own answer about what may be done', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    const head = slot('plan-head')
    expect(head?.querySelector('[data-slot="plan-settings-menu"]')).not.toBeNull()
    expect(head?.contains(screen.getByRole('button', { name: 'Share' }))).toBe(true)
    expect(screen.getByRole('link', { name: '+ Group' }).getAttribute('href')).toBe(`/plans/${PLAN_A}/new/group`)
  })

  it('draws a chip per group of the plan, the chips having left the plan heading', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    expect(document.querySelectorAll('[data-slot="group-chip"]')).toHaveLength(atlasPlan().labels.length)
  })

  // A rail is named in exactly one place on this page, the board's column, and a feature in the table and
  // nowhere else, the canvas drawing no text at all. Every one is addressed with the plan's **id**, which is
  // what the route builders take: a builder handed the plan's path encodes it into the address, and every
  // link on the page goes nowhere — which this caught when the screen first moved into the browser.
  it('addresses one rail and one feature the same way wherever the page links to them', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    await show()
    const rails = screen.getAllByRole('link', { name: 'Platform' })
    expect(rails).toHaveLength(1)
    for (const link of rails) expect(link.getAttribute('href')).toBe(railPath(PLAN_A, EPIC_1))
    // A feature's link is the bar itself, which carries no accessible name at all: the canvas is one
    // `role="img"` and the bar is `tabIndex={-1}` inside it, deliberately (`canvas/rail-features.tsx`).
    const bar = document.querySelector('[data-slot="feature-bar"][data-feature-id="' + FEATURE_1 + '"]')
    expect(bar?.closest('a')?.getAttribute('href')).toBe(featurePath(PLAN_A, FEATURE_1))
    await tableShown()
    const edit = document.querySelector(`[data-testid="row-${FEATURE_1}"] [data-slot="row-actions"] a`)
    expect(edit?.getAttribute('href')).toBe(featurePath(PLAN_A, FEATURE_1))
  })

  // Atlas plans eight days on a fourteen-day sprint, which is 28 days of axis — 1176px at the finest
  // stop's 42px a day, inside the pane the range is chosen against. So the finest of the three wins.
  // A single constant default is what drew a sixteen-day plan into the first ninety pixels of eleven
  // hundred, which is why `readZoom` answers `null` rather than a rung and why choosing one is this
  // layout's job.
  it('opens the plan at the finest zoom it fits into when the reader has never chosen one', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    expect((await handedTo(PLAN_A))['zoom']).toBe('item')
  })

  it('draws at the rung the reader last chose in preference to the one the plan would fit', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    chosenZoom = 'epic'
    expect((await handedTo(PLAN_A))['zoom']).toBe('epic')
  })

  // The cookie is client-writable, so junk in it is a state the page has to render. It falls back to
  // the fit rather than to a refusal or to a rung `ZOOM_VIEW` has no record for.
  it('falls back to the fit when the cookie holds something that is not a rung at all', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    chosenZoom = 'quarterly'
    expect((await handedTo(PLAN_A))['zoom']).toBe('item')
  })

  it('marks the rung it draws the axis at as the current one, so the control and the axis cannot disagree', async () => {
    holdingAdmin(api)
    api.plans = [atlasPlan()]
    chosenZoom = 'feature'
    await show()
    expect(screen.getByText(ZOOM_WORDS.feature).getAttribute('aria-current')).toBe('true')
    const axis = planAxis(planScreenModel(atlasPlan()), new Date(), 'feature')
    expect(slot('plan-pointer')?.getAttribute('data-px-per-day')).toBe(String(axis.scale.pxPerDay))
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
  // one over owes — and the screen moving into the browser leaves it exactly as strict, everything the
  // browser calls being handed over here, across the one boundary there is: every function must be a module action imported by name, since reflection can see all
  // there is to see of one, where a **bound** action could carry a token invisibly —
  // `action.bind(null, token)` exposes neither the token nor a name of its own, and
  // `Function.prototype.bind` names its result `bound <name>`. The canvas's drag is what made this layout
  // hand the screen the writes, so the assertion becomes the drawer pages': exactly the plan writes, each
  // named, none bound and none anonymous. Nothing is relaxed — the empty list only ever stood because
  // there was no write on this surface to hand over.
  // The two binding actions are handed over **twice** — once inside `ADMIN_PLAN_ACTIONS` and once as the
  // bindings panel's own two props — so this compares sets rather than lists. What it is actually about is
  // unchanged and is the second assertion: not one function crossing this boundary is a `bound ` closure,
  // which is the one mechanism ADR 0040 describes for smuggling a token into a component.
  it('hands over every write by name and nothing bound, so no token hides in an action’s arguments', async () => {
    const handed = handedBy(await shown())
    const expected = new Set([...Object.keys(ADMIN_PLAN_ACTIONS), ...OFF_INTERFACE])
    expect([...new Set(handed.functions)].sort()).toEqual([...expected].sort())
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
    expect(handed.functions.filter((name) => name === '')).toEqual([])
  })
})
