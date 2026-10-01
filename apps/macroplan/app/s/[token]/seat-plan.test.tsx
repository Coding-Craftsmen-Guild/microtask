import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bridgeReadKey,
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
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  REVOKED_SEAT_TOKEN,
  SEAT_TOKEN,
  tangledPlan,
  WRITE_SEAT_TOKEN,
} from '../../../components/plan/testing/plan-fixture'
import { DEFAULT_ZOOM, openingZoom } from '../../../components/plan/canvas/zoom-view'
import { SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import { planCapabilities } from '../../../lib/plan-capabilities'
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
  // The pointer root calls `useRouter`, which throws outside an App Router tree. It is handed no zoom on
  // this surface and so writes nothing here; what it does with a router is asserted where it lives
  // (`components/plan/canvas/plan-pointer.test.tsx`).
  useRouter: () => ({ push: () => undefined }),
}))

// The two seat-action modules by export name, so the recorders below stand in for every one of them. A
// name missing here is a missing export at import time rather than a silent pass-through, which is what
// makes mocking the whole module safe.
const SEAT_WRITE_NAMES = [
  'seatCreateEpic',
  'seatRenameEpic',
  'seatRecolourEpic',
  'seatReorderEpic',
  'seatRemoveEpic',
  'seatCreateFeature',
  'seatRenameFeature',
  'seatEstimateFeature',
  'seatPinFeature',
  'seatPlaceFeature',
  'seatSetDependencies',
  'seatRemoveFeature',
  'seatCreateItem',
  'seatRenameItem',
  'seatEstimateItem',
  'seatDescribeItem',
  'seatPlaceItem',
  'seatRemoveItem',
]

const SEAT_BRIDGE_NAMES = [
  'seatBindEpic',
  'seatUnbindEpic',
  'seatLinkItem',
  'seatUnlinkItem',
  'seatCreateTask',
  'seatCreateLabel',
  'seatRenameLabel',
  'seatRecolourLabel',
  'seatRemoveLabel',
  'seatLabelFeature',
]
const NOT_A_TOKEN = 'not-a-token'

// Every export of the two seat-action modules, replaced by a recorder that keeps the arguments it was
// called with. This is what lets the leak sweep read a **bound** action: `bind` hides its arguments in a
// closure with no reflective access, so the only way to learn which token a handed action carries is to
// call it and see what arrives. `components/plan/seat-actions.test.ts` mocks the same two modules for the
// neighbouring question — which action each member is wired to — and this file asks only about the token.
const bound: unknown[][] = []

const recorder =
  (name: string) =>
  (...args: unknown[]): Promise<unknown> => {
    bound.push(args)
    return Promise.resolve({ ok: true, value: name })
  }

const recorders = (names: readonly string[]): Record<string, unknown> =>
  Object.fromEntries(names.map((name) => [name, recorder(name)]))

vi.mock('../../../actions/seat-writes', () => recorders(SEAT_WRITE_NAMES))

vi.mock('../../../actions/seat-bridge', () => recorders(SEAT_BRIDGE_NAMES))

const NOT_A_ULID = 'not-a-ulid'

let api: FakePlanApiState

// Every answer body the fake actually put on the wire, which is what the leak sweep derives its
// recogniser from. Same wrapper as read-share.test.ts; its natural home is fake-plan-api.ts if a
// third file ever wants it.
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

const { seatPlanScreen } = await import('./seat-plan')

// The screen is no longer a route page: it is the function `layout.tsx` calls with its own `children` as
// the drawer slot, which is what gave this surface somewhere to put one. Called with `null` here, because
// what every case below asks about is the plan and its managers rather than what is open beside them —
// the drawer segments have tests of their own.
const screenFor = (token: string) => seatPlanScreen(token, null)

const seated = (token: string): string => {
  const stored = atlasPlan().shareLinks.find((seat) => seat.token === token)
  if (stored === undefined) throw new Error(`the fixture holds no seat ${token}`)
  holdingSeat(api, PLAN_A, stored.role, token)
  return token
}

const show = async (token = SEAT_TOKEN) => render(await screenFor(token))

const slot = (name: string): Element | null => document.querySelector(`[data-slot="${name}"]`)

const slots = (name: string): readonly Element[] => [
  ...document.querySelectorAll(`[data-slot="${name}"]`),
]

const thrownBy = async (token: string): Promise<unknown> => {
  try {
    await screenFor(token)
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

// How a token-shaped string is recognised, and why it is neither a prefix nor a shape: `ShareToken`
// is /^[A-Za-z0-9_-]{16,64}$/ with no prefix to match on — Microtask's `shr_` has no analogue here —
// and a 26-character ULID satisfies that regexp too, so a shape test would demand that every plan id
// be the visitor's own token. The recogniser is therefore the set of tokens the fake **actually
// served in this very run**, collected out of the answer bodies by the one field a token can travel
// in. That is complete under any fixture: a candidate list computed from `atlasPlan()` at module
// scope would silently narrow the moment a test seeded a plan with different seats, and nothing
// would tie the two together.
const tokensServed = (): readonly string[] => {
  const found = new Set<string>()
  const walk = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) return
    const token = (value as { token?: unknown }).token
    if (typeof token === 'string') found.add(token)
    for (const child of Object.values(value)) walk(child)
  }
  answered.forEach(walk)
  return [...found]
}

// The walk reads `props` **and `key`**: React moves `key` off props onto the element, and a key is
// serialised into the Flight payload, so `<div key={token}>` is a real leak the props-only version of
// this sweep could not see.
//
// **The gap this used to record is closed.** Functions are skipped by `stringsIn`, so a Server Action bound
// as `action.bind(null, token)` is invisible to it — which is exactly how ADR 0040 says a page hands its
// token to a component. For four phases nothing on this surface bound one and the sweep asserted there were
// **no functions at all**, which avoided the question rather than answering it.
//
// A bound function cannot be introspected: `Function.prototype.bind` keeps its arguments in a closure with
// no reflective access, and `.name` answers only `"bound seatRenameFeature"`. So the sweep **calls** each
// one. `actions/seat-writes` and `actions/seat-bridge` are mocked to recorders, so calling a handed member
// reaches a recorder instead of the API and the arguments it was bound with arrive as the recorded call.
// `boundTokensOf` below is that walk, and it is strictly stronger than the assertion it replaces: it proves
// every bound action carries **the visitor's own token and no other**, where the old one proved only that
// nobody had bound anything yet.
//
// What stays true is the rule the old comment was protecting. The one token an `/s/*` response may carry is
// the visitor's own, already in their address bar; `tokensHandedBy` is what proves no *other* seat's token
// is in the payload, and it is unchanged.
const stringsIn = (value: unknown, visited = new WeakSet<object>()): string[] => {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function' || typeof value !== 'object' || value === null) return []
  if (visited.has(value)) return []
  visited.add(value)
  if (!isValidElement(value)) {
    return Object.values(value).flatMap((child: unknown) => stringsIn(child, visited))
  }
  const keyed = value.key === null ? [] : stringsIn(value.key, visited)
  return [...keyed, ...stringsIn(value.props, visited)]
}

// Every attribute in the rendered markup whose value mentions one token, as `[name, value]` pairs.
//
// The element-tree sweeps above answer what a *page* hands over; this answers what a **browser receives**,
// which is a different and narrower question: a Server Component's props never reach it. Both are needed —
// a token in a client component’s prop is in the Flight payload without being in the HTML, and a token in
// an href is in the HTML without being a leak at all when it is the visitor’s own.
const attributesContaining = (root: HTMLElement, token: string): readonly [string, string][] =>
  [...root.querySelectorAll('*')].flatMap((node) =>
    [...node.attributes]
      .filter((one) => one.value.includes(token))
      .map((one) => [one.name, one.value] as [string, string]),
  )
const tokensHandedBy = (element: ReactNode, served = tokensServed()): string[] =>
  stringsIn(element).filter((one) => served.some((token) => one.includes(token)))

// Every function this page hands over, collected as the callables themselves rather than as their names.
//
// Names were what the old sweep collected, and they answer nothing useful about a bound action: `bind` names
// its result `"bound seatRenameFeature"` at best, and a mocked recorder gives `"bound "`. What the question
// needs is the callable, so it can be invoked and the arguments it closed over read off the recorder.
const callablesIn = (value: unknown, visited = new WeakSet<object>()): unknown[] => {
  if (typeof value === 'function') return [value]
  if (typeof value !== 'object' || value === null || visited.has(value)) return []
  visited.add(value)
  const children = Object.values(isValidElement(value) ? (value.props as object) : value)
  return children.flatMap((child: unknown) => callablesIn(child, visited))
}

// The first argument every handed action was bound with. This is the answer to the question the old
// zero-functions assertion sidestepped: a seat action takes its token first (`seat-writes.ts`), so the
// first recorded argument of each call **is** the credential that action will present.
const boundTokensOf = async (element: ReactNode): Promise<string[]> => {
  bound.length = 0
  const callables = callablesIn(element) as ((...args: unknown[]) => unknown)[]
  for (const call of callables) await call(PLAN_A, EPIC_1, FEATURE_1)
  return bound.map((one) => one[0]).filter((one): one is string => typeof one === 'string')
}

describe('a plan seat lands on the one plan its token opens', () => {
  // Three reads, all under the URL token, and the **order of the first two is the point**: the bootstrap
  // says which plan this token reaches, and the plan read uses that answer rather than an id from the
  // address — there being no plan id in a seat’s URL to use. The bridge follows because it needs the same
  // plan id, and it is the second read ADR 0061 keeps off the path that draws the timeline: a refusal of it
  // is `null` and costs the plan nothing.
  it('asks what the token reaches, then reads that plan and its bridge, all under the URL token', async () => {
    seated(SEAT_TOKEN)
    await show()
    const seen = trace(api)
    expect(seen[0]).toBe(`${currentShareKey()} ${SEAT_TOKEN}`)
    expect(seen).toHaveLength(3)
    expect([...seen].sort()).toEqual(
      [
        `${currentShareKey()} ${SEAT_TOKEN}`,
        `${planReadKey(PLAN_A)} ${SEAT_TOKEN}`,
        `${bridgeReadKey(PLAN_A)} ${SEAT_TOKEN}`,
      ].sort(),
    )
  })

  it('reads the plan the bootstrap named, never an id from the URL', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(trace(api)).toContain(`${planReadKey(PLAN_A)} ${SEAT_TOKEN}`)
    expect(api.received.every((one) => !one.path.includes(NOT_A_ULID))).toBe(true)
  })

  it.each([SEAT_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN])(
    'draws the same screen the admin page draws, for the seat holding %s',
    async (token) => {
      seated(token)
      await show(token)
      expect(screen.getByRole('heading', { level: 1, name: 'Atlas rollout' })).toBeTruthy()
      expect(screen.getByRole('img', { name: 'Timeline of Atlas rollout' })).toBeTruthy()
      expect(slots('feature-bar')).toHaveLength(2)
      expect(slots('item-mark')).toHaveLength(3)
      // The calendar is three spans with `aria-hidden` separators between them rather than one
      // sentence, so each fact is asserted on its own. Matching the punctuated line would be
      // asserting how the head spells a separator, which is not a thing about this page at all.
      for (const fact of ['starts 2026-09-28', '14-day sprints', 'Europe/Belgrade']) {
        expect(screen.getByText(fact)).toBeTruthy()
      }
    },
  )

  it('draws the table beside it, so the plan is readable without the picture', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Table' })).toBeTruthy()
  })

  // **The bug this page shipped with, stated as a test.** The screen's split is a flex row of a
  // sidebar pane and a main pane, and it was a two-column grid when this surface passed `null` for
  // the sidebar: a null child is no grid item at all, so the board became the *first* item and drew
  // itself into the 17rem names track — a 272px timeline on a 1545px page, with the wide column
  // beside it empty. It is asserted as containment rather than as a class, because what went wrong
  // was which box the board was in.
  it('gives the rail tree a pane of its own and draws the board in the pane beside it', async () => {
    seated(SEAT_TOKEN)
    await show()
    const side = slot('plan-side')
    const board = slot('plan-board')
    expect(side?.querySelector('[data-slot="plan-sidebar"]')).not.toBeNull()
    expect(board).not.toBeNull()
    expect(side?.contains(board as Node)).toBe(false)
    expect(slot('plan-main')?.contains(board as Node)).toBe(true)
  })

  // The tree lists every rail and every feature, so this surface draws links where it used to draw
  // none — and the rails are the exception. `SEAT_DRAWER_ROUTES.rail` is `null` because there is no
  // `/s/<token>/r/<epicId>` to open, and linking the admin one would send a holder to a password
  // form they have no password for (ADR 0032). Asserted by accessible name, which covers both places
  // a rail is named: the tree, and the names column beside the canvas.
  it('names each rail as text and never as a link, a seat having no rail drawer to open', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(SEAT_DRAWER_ROUTES.rail).toBeNull()
    expect(slot('rail-names')?.textContent).toContain('Platform')
    expect(screen.queryAllByRole('link', { name: 'Platform' })).toEqual([])
  })

  // A feature is the thing a seat *can* open, and it is linked twice over: the bar on the canvas, which is
  // what a reader clicks first, and the row in the tree, which is the keyboard path to the same drawer —
  // the bar is `tabIndex={-1}` inside a `role="img"`, so it is no keyboard stop at all. Both are built from
  // the same `SEAT_DRAWER_ROUTES`, so they cannot disagree about where a feature lives on this surface.
  // The bar is still a link to the same place, and it is no longer a *named* one: its accessible name
  // was the `<text>` drawn on it, and the canvas draws no text now. Nothing is lost that a reader had
  // — the canvas is `role="img"`, which prunes its whole subtree from the accessibility tree, and the
  // anchor carries `tabIndex={-1}`, so this link was never a stop a keyboard reached or a screen
  // reader announced. The named way in is the tree row, which is what `rail-features.tsx` says.
  it('offers a feature by name from its tree row, and aims its bar at the same address', async () => {
    seated(SEAT_TOKEN)
    await show()
    const named = screen.getAllByRole('link', { name: 'Auth rewrite' })
    expect(named).toHaveLength(1)
    expect(named[0]?.getAttribute('href')).toBe(`/s/${SEAT_TOKEN}/f/${FEATURE_1}`)
    const bar = document.querySelector(`[data-slot="feature-bar"][data-feature-id="${FEATURE_1}"]`)
    expect(bar?.closest('[data-slot="feature-link"]')?.getAttribute('href')).toBe(
      `/s/${SEAT_TOKEN}/f/${FEATURE_1}`,
    )
  })

  // Zoom is a cookie on the admin surface — `readZoom` reads one and the control's form writes one,
  // then revalidates `/plans` — and this page may read no cookie at all, so it is handed no control
  // and picks the rung the plan itself fits instead. Atlas ends on day eight, which is 28 days once
  // the axis is padded out to whole sprints and so about 1200px at forty-two pixels a day: it fits,
  // so the finest rung wins. That is a real difference from the constant this used to pass, which
  // spread those eight days across a quarter of axis and left the rest of the chart blank.
  it('opens at the rung this plan fits, rather than at the one constant it cannot improve on', async () => {
    seated(SEAT_TOKEN)
    const element: ReactNode = await screenFor(SEAT_TOKEN)
    const handed = isValidElement<{ zoom: unknown }>(element) ? element.props.zoom : null
    expect(handed).toBe('item')
    expect(handed).toBe(openingZoom(atlasPlan()))
    expect(handed).not.toBe(DEFAULT_ZOOM)
  })

  // **Where the conflict list went.** This surface mounted one for a phase, and a `view` seat got it too
  // on the argument that a conflict is a fact about the plan rather than something needing the authority
  // to fix it. That argument survives; the panel does not. It listed every complaint the schedule made —
  // one row per unsized *item* included, each row printed twice — above the timeline, which is how the
  // deployed page came to start 2780px down. What a seat gets instead is one row per feature that has **no
  // bar**, under the board: the tangled plan's cycle strands two of its four features, so the tray names
  // those two, in the rail order the reader just saw, and says why beside each.
  it('lists each feature with no bar in a tray under the board, where a panel used to sit above it', async () => {
    seated(SEAT_TOKEN)
    api.plans = [tangledPlan()]
    await show()
    const tray = slot('unscheduled-tray')
    expect(tray).not.toBeNull()
    expect(slots('tray-row').map((row) => row.querySelector('a')?.textContent)).toEqual([
      'Auth rewrite',
      'Billing',
    ])
    expect(tray?.textContent).toContain('In a dependency cycle')
    expect(slot('timeline-panel')?.contains(tray as Node)).toBe(true)
  })

  // Its links are this surface's own, which is the thing the old panel could never manage: it imported the
  // admin path builders, so every row it drew addressed `/plans/…`, and that is why it was admin-only until
  // the routes were handed in. The tray takes `SEAT_DRAWER_ROUTES` from this page, so a holder following a
  // row stays on the surface their token opens.
  it('links each tray row into this surface, so acting on a stranded feature needs no cookie', async () => {
    seated(SEAT_TOKEN)
    api.plans = [tangledPlan()]
    await show()
    const hrefs = [...document.querySelectorAll('[data-slot="tray-row"] a')].map((one) =>
      one.getAttribute('href'),
    )
    expect(hrefs).toEqual([`/s/${SEAT_TOKEN}/f/${FEATURE_1}`, `/s/${SEAT_TOKEN}/f/${FEATURE_2}`])
  })

  // An unsized item gets no row of its own. It rolls up into a badge on the feature that owns it — the
  // cycle here drags `Invoices` off the axis with `Billing`, and `Billing` carries both facts on one dot —
  // which is the difference between the three marks this plan draws and one row per complaint, the shape
  // that reached thirty rows on the deployed plan.
  // The item the cycle also stranded is not a row and not a mark. It is reported unplaced because its
  // *feature* is in the cycle, and that feature already carries the badge; repeating it on each of
  // its items would multiply one fact by however finely somebody broke the work down.
  it('leaves the item the cycle also stranded unmarked, its feature already saying so', async () => {
    seated(SEAT_TOKEN)
    api.plans = [tangledPlan()]
    await show()
    expect(slots('tray-row')).toHaveLength(2)
    expect(slot('unscheduled-tray')?.textContent).not.toContain('Invoices')
    const titles = slots('attention-dot').map((dot) => dot.getAttribute('title'))
    expect(titles).toContain('In a dependency cycle')
    expect(titles).toContain('Dependency on Reporting set aside')
    for (const title of titles) expect(title ?? '').not.toContain('item')
  })

  // The head counts **features**, and the count is what tells a reader there is anything to look for at
  // all. Not entities: the map holds the stranded item too, and counting that beside its feature's rollup
  // made the header say more than the page under it shows.
  it('counts the three features that want looking at, beside the plan’s calendar', async () => {
    seated(SEAT_TOKEN)
    api.plans = [tangledPlan()]
    await show()
    expect(slot('attention-chip')?.textContent).toBe('3 need attention')
  })

  // A plan whose every feature has a bar draws no tray, no dot and no count, so the four cases above are
  // about a plan in trouble rather than about furniture this page always carries.
  it('draws no tray, no mark and no count for a plan whose every feature has a bar', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(slot('unscheduled-tray')).toBeNull()
    expect(slot('attention-dot')).toBeNull()
    expect(slot('attention-chip')).toBeNull()
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
  it('sees one in a prop, in a child, and in a key — which props-only walking cannot', () => {
    const planted: ReactNode = (
      <div data-seat={`seat ${WRITE_SEAT_TOKEN}`}>
        <p key={MANAGE_SEAT_TOKEN}>{[REVOKED_SEAT_TOKEN]}</p>
      </div>
    )
    const found = stringsIn(planted)
    expect(found.filter((one) => one.includes(WRITE_SEAT_TOKEN))).toHaveLength(1)
    expect(found).toContain(REVOKED_SEAT_TOKEN)
    expect(found).toContain(MANAGE_SEAT_TOKEN)
    expect(stringsIn(<p key={SEAT_TOKEN} />)).toEqual([SEAT_TOKEN])
  })

  it('finds no token to recognise in a tree that holds none', () => {
    expect(stringsIn(<p>Atlas rollout</p>)).toEqual(['Atlas rollout'])
    expect(tokensHandedBy(<p>Atlas rollout</p>, [SEAT_TOKEN])).toEqual([])
  })

  // **No other seat’s token, and the visitor’s own only as a path on this surface.**
  //
  // This asserted *no token at all* while this screen drew no link, and the sidebar is what ended that:
  // every rail's features are links to `/s/<token>/f/<featureId>`, and the tray adds one per stranded
  // feature. So the token is in the screen's own payload — admissible for exactly one token, the visitor's
  // own, already in the address bar they arrived by (ADR 0040) and already in `LinkFrame`'s brand link one
  // level up. The `/s/*` subtree sets `no-referrer`, so following one of these does not hand the token
  // anywhere else either.
  //
  // What the two halves below say is stronger than the assertion they replace, rather than weaker. No
  // **other** seat’s token appears at all — which is the leak that would matter, a manage seat being the
  // one role the API tells the plan's other seats. And the visitor's own appears **only inside a path on
  // this surface**, so it cannot ride along in a prop that is not a link: a token in a `data-` attribute, a
  // name, or an action’s arguments fails the second half even though the first is satisfied.
  it('hands a manage seat no other seat’s token, and its own only inside a path on this surface', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(MANAGE_SEAT_TOKEN)
    const { container } = render(element)
    const served = tokensServed()
    expect(served).toHaveLength(3)
    expect(served).toContain(SEAT_TOKEN)
    const others = served.filter((one) => one !== MANAGE_SEAT_TOKEN)
    expect(others).toHaveLength(2)
    expect(tokensHandedBy(element, others)).toEqual([])
    for (const token of others) expect(container.innerHTML).not.toContain(token)
    // The visitor's own, checked against the **rendered markup** rather than the element tree, and that
    // distinction is the point. `stringsIn` walks every element including Server Components, and a Server
    // Component's props are not serialised to the browser — `PlanSidebar` and `UnscheduledTray` are each
    // handed the bare token as their `root` and nothing of that reaches the client. What does reach it is
    // the HTML, so the attribute sweep below is the one that describes the exposure: the token is in link
    // hrefs on this surface and nowhere else, not in a `data-` attribute, a name or a value of any other
    // kind. It is required to be in at least one, which it was not while this screen linked to nothing:
    // the Atlas fixture now draws a tree of them, so a sweep finding none would mean the sidebar had
    // stopped rendering rather than that nothing leaked.
    const carried = attributesContaining(container, MANAGE_SEAT_TOKEN)
    expect(carried.length).toBeGreaterThan(0)
    for (const [name, value] of carried) {
      expect({ name, onSurface: value.startsWith(`/s/${MANAGE_SEAT_TOKEN}/`) }).toEqual({
        name: 'href',
        onSurface: true,
      })
    }
  })

  // The same rule over the plan that needs every link this surface can draw: the tree links four features,
  // the tray links the two with no bar, and not one of them may be the admin path a cookie answers. The
  // rails are the ones with no link at all, `SEAT_DRAWER_ROUTES.rail` being null, so an href here is always
  // a feature or an item.
  it('addresses every link it draws at this surface, never at /plans, which needs a cookie', async () => {
    seated(MANAGE_SEAT_TOKEN)
    api.plans = [tangledPlan()]
    const { container } = render(await screenFor(MANAGE_SEAT_TOKEN))
    const hrefs = [...container.querySelectorAll('a')].map((one) => one.getAttribute('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href.startsWith(`/s/${MANAGE_SEAT_TOKEN}/`)).toBe(true)
    // And every attribute carrying the token is one of those hrefs, which is what makes the case above a
    // rule rather than a statement about which of this page's regions happened to render a link.
    for (const [name] of attributesContaining(container, MANAGE_SEAT_TOKEN)) {
      expect(name).toBe('href')
    }
    for (const token of tokensServed().filter((one) => one !== MANAGE_SEAT_TOKEN)) {
      expect(container.innerHTML).not.toContain(token)
    }
  })

  it('binds its own token into every action it hands over, and no other seat’s', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const tokens = await boundTokensOf(await screenFor(MANAGE_SEAT_TOKEN))
    expect(tokens.length).toBeGreaterThan(0)
    expect([...new Set(tokens)]).toEqual([MANAGE_SEAT_TOKEN])
  })

  // The half a set comparison would hide. Every *other* token the fake API serves must be absent from what
  // any handed action carries, and a sweep that only checked the visitor own token was present would pass
  // for an action bound with both.
  it('binds no token the API happens to serve beside it, token by token', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const tokens = await boundTokensOf(await screenFor(MANAGE_SEAT_TOKEN))
    for (const other of tokensServed().filter((one) => one !== MANAGE_SEAT_TOKEN)) {
      expect(tokens).not.toContain(other)
    }
  })

  // A write seat holds no rail or group action, so it is handed the drag and the drawer writes and no
  // panel at all — which is a different number of bound actions, all carrying the same one token.
  it('binds the write seat’s own token too, there being fewer actions rather than other tokens', async () => {
    seated(WRITE_SEAT_TOKEN)
    const tokens = await boundTokensOf(await screenFor(WRITE_SEAT_TOKEN))
    expect([...new Set(tokens)]).toEqual([WRITE_SEAT_TOKEN])
  })

  // The planted case, kept and inverted: it used to prove the walker could *see* a bound action, and now
  // proves it can read what one was bound with. Without this the two cases above would pass against a
  // walker that found nothing to call.
  it('reads the argument a planted bound action carries, so the cases above can fail', async () => {
    bound.length = 0
    const write = async (token: string): Promise<void> => {
      bound.push([token])
      await Promise.resolve()
    }
    expect(await boundTokensOf(<form action={write.bind(null, SEAT_TOKEN)} />)).toEqual([SEAT_TOKEN])
    expect(await boundTokensOf(<p>Atlas rollout</p>)).toEqual([])
  })

  it('renders from a plan whose seats were dropped on the server, not merely unrendered', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element = await screenFor(MANAGE_SEAT_TOKEN)
    const plan = isValidElement<{ plan: { shareLinks?: unknown } }>(element)
      ? element.props.plan
      : undefined
    expect(plan).toBeTruthy()
    expect(Object.keys(plan ?? {})).not.toContain('shareLinks')
  })
})

describe('which controls the seat’s own role draws', () => {
  it.each([
    [SEAT_TOKEN, 'view'],
    [WRITE_SEAT_TOKEN, 'write'],
    [MANAGE_SEAT_TOKEN, 'manage'],
  ] as const)('hands %s the answers planCapabilities gives a %s seat of this plan', async (token, role) => {
    seated(token)
    const element: ReactNode = await screenFor(token)
    const handed = isValidElement<{ controls: unknown }>(element) ? element.props.controls : null
    expect(handed).toEqual(planCapabilities(role, { kind: 'plan', planId: PLAN_A }))
  })

  it('asks with a plan-kind scope, which a project-kind one of the same id answers differently', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(MANAGE_SEAT_TOKEN)
    const handed = isValidElement<{ controls: { seats: { read: boolean } } }>(element)
      ? element.props.controls
      : null
    expect(handed?.seats.read).toBe(true)
    expect(planCapabilities('manage', { kind: 'project', projectId: PLAN_A }).seats.read).toBe(false)
  })

  // The role and the scope are what `planCapabilities` is asked with, and neither goes down: a
  // permission restated below this point is one nothing authorises, and a component added later
  // could ask a second question of it. What the screen takes is now fourteen props rather than
  // thirteen, and the four slots it used to be handed — `conflicts`, `rails`, `settings`, `share` —
  // are gone from the list: the panel is deleted outright and the other three are one `manage` slot
  // on the screen, which this surface now fills from the head row like the admin's. `root`, `routes`,
  // `tray`, `zoomControl` and `manage` are what replaced them.
  //
  // `home` left in the restyle. It was where the breadcrumb climbed to, and this surface always passed
  // `null` because it holds one plan and has no index above it. The crumb is the brand bar's now, and
  // this surface's bar (`components/link/link-frame.tsx`) draws none — so the absence is still stated,
  // one layer out, by there being no slot to fill.
  it('hands the screen fourteen props, the four panel slots it used to take being gone', async () => {
    seated(WRITE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(WRITE_SEAT_TOKEN)
    expect(isValidElement(element)).toBe(true)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(Object.keys(handed).sort()).toEqual([
      'actions',
      'at',
      'controls',
      'drawer',
      'groups',
      'manage',
      'newRailHref',
      'plan',
      'progress',
      'root',
      'routes',
      'sidebar',
      'tray',
      'zoom',
      'zoomControl',
      'zoomTo',
    ])
  })

  // Four of them are `null`, and each `null` is this page saying something about itself rather than a
  // slot nobody got round to filling.
  //
  // `drawer` because the *screen* is called with none here — `layout.tsx` is what passes its children in.
  // `home` because there is no plan index a seat may reach, so the head climbs to nothing rather than
  // offering a crumb into a surface that answers with a password form. `manage` because the buttons it draws
  // are links
  // to `/plans/<id>/new/group`, `/settings` and `/share`, none of which exists under `/s/<token>` — this
  // seat's own editors are in the sidebar, which is the case below. And `zoomControl` because choosing a
  // zoom means writing the `mp_zoom` cookie and revalidating `/plans`, both of which this surface is
  // forbidden (ADR 0040); the rung it opens at is the plan's own fit instead. `zoomTo` is the same fact
  // said to the pointer root rather than to the control: with no action to call, a wheel over this board
  // is left entirely to the browser rather than swallowed by a gesture that could write nothing. And
  // `newRailHref` because `/plans/<id>/new/rail` is an admin path: a manage seat *may* create a rail, so
  // the capability alone would have put a link to a login they have no password for in the table's own
  // toolbar — which is the mistake `DrawerRoutes` exists to stop a component making (ADR 0032).
  it('states five slots empty: no drawer, no whole-plan actions, no zoom and nowhere to add a rail', async () => {
    seated(WRITE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(WRITE_SEAT_TOKEN)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    for (const empty of ['drawer', 'manage', 'newRailHref', 'zoomControl', 'zoomTo']) {
      expect(handed[empty], empty).toBeNull()
    }
    // And three that are filled, every one of them new to this surface: the tree that used to be a null
    // column, the chips that used to be the heading's, and the tray that replaced the conflict panel.
    for (const filled of ['groups', 'sidebar', 'tray']) {
      expect(handed[filled], filled).not.toBeNull()
    }
  })

  // Every URL this screen builds is rooted at the token and not at the plan id, which is the whole of what
  // `root` and `routes` are for: one surface hands its own root plus its own builders, and the components
  // that draw a link — the tree, the tray, the names column — need no opinion about which kind of string
  // they hold. Handing `PLAN_A` here would give a holder a page of links into a surface their token does
  // not open.
  it('roots every link the screen builds at this URL’s token, never at the plan id it resolved to', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(MANAGE_SEAT_TOKEN)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(handed['root']).toBe(MANAGE_SEAT_TOKEN)
    expect(handed['root']).not.toBe(PLAN_A)
    expect(handed['routes']).toBe(SEAT_DRAWER_ROUTES)
  })

  it('hands the screen the capabilities themselves and never the role or the scope it asked with', async () => {
    seated(WRITE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(WRITE_SEAT_TOKEN)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect((handed['controls'] as { seats: Record<string, boolean> }).seats).toEqual({
      read: false,
      create: false,
      update: false,
      revoke: false,
    })
    // `actions` is the seat's own wiring, every member bound to the token in this page's URL. What
    // makes that safe is the sweep above rather than this case: it calls each handed action and
    // asserts the token it carries is the visitor's own and no other. Asserted here as a shape only — that
    // it is an object of functions — because which functions is `seat-actions.test.ts`'s question.
    const writes = handed['actions'] as Record<string, unknown>
    expect(Object.values(writes).every((one) => typeof one === 'function')).toBe(true)
    expect(Object.keys(writes).length).toBeGreaterThan(0)
    const groups = Object.values(handed['controls'] as Record<string, Record<string, unknown>>)
    expect(groups.flatMap((group) => Object.values(group)).every((one) => typeof one === 'boolean')).toBe(true)
  })

  // The four editors a seat may be handed are the same four as before — rails, groups, settings, seats —
  // and they are split by what they write. Rails and groups change what the plan *holds*, so they stay
  // under the rail tree they are about, in the column that already scrolls. Settings and sharing change
  // the plan itself and who may open it, and they are two menus in the head row — the same two the admin
  // surface draws, which is what this surface could not do while they were drawer routes it has no
  // address for. Which is what a plan shared at `manage` is for: the holder adds a rail, groups a
  // feature, corrects the calendar and hands on a seat of their own, with no admin cookie anywhere.
  it('puts the content editors under the rail tree for a manage seat, every action behind them being manage', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await show(MANAGE_SEAT_TOKEN)
    const panel = slot('seat-manage')
    expect(panel).not.toBeNull()
    for (const each of ['rails-panel', 'labels-panel']) {
      expect(panel?.querySelector(`[data-slot="${each}"]`), each).not.toBeNull()
    }
    expect(slot('plan-side')?.contains(panel as Node)).toBe(true)
  })

  it('puts the plan’s own settings and its seats in the head row, where the admin’s are', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await show(MANAGE_SEAT_TOKEN)
    const head = slot('plan-head')
    expect(head?.querySelector('[data-slot="plan-settings-menu"]')).not.toBeNull()
    expect(head?.contains(screen.getByRole('button', { name: 'Share' }))).toBe(true)
    expect(slot('seat-manage')?.querySelector('[data-slot="plan-settings-menu"]')).toBeFalsy()
  })

  // The other direction, and what makes the case above a rule rather than a page that draws everything for
  // everybody. Every action behind the four is `manage` in the kernel — the share four, the five rail
  // actions, the five group ones and the three plan ones — so a `write` seat is refused all of them just as
  // a `view` seat is, and the panel that would hold them is absent rather than empty.
  it.each([SEAT_TOKEN, WRITE_SEAT_TOKEN])(
    'draws no editor at all for the seat holding %s, every one of the four being manage',
    async (token) => {
      seated(token)
      await show(token)
      expect(slot('seat-manage')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Share' })).toBeNull()
    },
  )

  // A view seat is the floor, and it still gets the one control that changes only what is on screen: the
  // group chips, which are the toolbar's rather than the heading's now. Picking one dims everything outside
  // that group through a generated stylesheet, so it writes nothing and asks nothing of the API.
  it('gives a view seat the group chips all the same, picking one writing nothing to the plan', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(slot('group-chips')).not.toBeNull()
    expect(slots('group-chip').map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Phase 1 · 1 feature',
      'Phase 2 · empty',
    ])
  })

  it('draws no control for a view seat and every content one for a manage seat', async () => {
    const drawn = (element: ReactNode): readonly (readonly [string, boolean])[] =>
      isValidElement<{ controls: { content: Record<string, boolean> } }>(element)
        ? Object.entries(element.props.controls.content)
        : []
    // A view seat draws none of the twenty-eight, as before. A manage seat now draws twenty-six: the two
    // binding controls are admin-only (`epic:bind`), which design §7.3 requires — an epic's binding is the
    // ceiling on what a link holder reaches in Microtask, so a holder that could re-role one could raise
    // its own ceiling. They are the first controls in this product that no seat of any role draws.
    const ADMIN_ONLY = ['bindEpic', 'unbindEpic']
    seated(SEAT_TOKEN)
    const view = drawn(await screenFor(SEAT_TOKEN))
    expect(view).toHaveLength(28)
    for (const [control, answer] of view) expect(answer, control).toBe(false)
    seated(MANAGE_SEAT_TOKEN)
    const manage = drawn(await screenFor(MANAGE_SEAT_TOKEN))
    expect(manage).toHaveLength(28)
    for (const [control, answer] of manage) {
      expect(answer, control).toBe(!ADMIN_ONLY.includes(control))
    }
    expect(manage.filter(([, answer]) => answer)).toHaveLength(26)
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
