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
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  REVOKED_SEAT_TOKEN,
  SEAT_TOKEN,
  tangledPlan,
  WRITE_SEAT_TOKEN,
} from '../../../components/plan/testing/plan-fixture'
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

  // This asserted the opposite for four phases — no conflict list at all — and the reason was never that a
  // seat has nothing to fix: every link such a list drew was an admin drawer path, so a seat holder
  // following one would be sent to a surface that reads a cookie they have not got (ADR 0032). The list now
  // takes its surface’s own routes (`lib/drawer-routes.ts`), so it can be mounted here, and a `view` seat
  // gets it too: a conflict is a fact about the plan, and reading one needs no authority to fix it.
  it('draws the conflict list, now that its links can address this surface', async () => {
    seated(SEAT_TOKEN)
    api.plans = [tangledPlan()]
    await show()
    expect(document.querySelector('[data-slot="conflict-list"]')).not.toBeNull()
    expect(screen.queryAllByRole('link').length).toBeGreaterThan(0)
  })

  // A plan that contradicts itself in none of the three ways draws nothing, so the case above is about the
  // list being reachable rather than about it always being there.
  it('draws none for a plan that contradicts itself in none of the three ways', async () => {
    seated(SEAT_TOKEN)
    await show()
    expect(document.querySelector('[data-slot="conflict-list"]')).toBeNull()
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
  // This asserted *no token at all* until the conflict list was mounted here, and that was right for as
  // long as this screen drew no link: the brand link carrying the token is `LinkFrame`’s, one level up in
  // the layout. A conflict row links to `/s/<token>/f/<featureId>`, so the token is now in the screen’s own
  // payload — which is admissible for exactly one token, the visitor’s own, already in the address bar they
  // arrived by (ADR 0040), and already in that brand link. The `/s/*` subtree sets `no-referrer`, so
  // following one of these links does not hand the token to anywhere else either.
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
    // Component's props are not serialised to the browser — `ConflictList` is handed the bare token as its
    // `root` and nothing of that reaches the client. What does reach it is the HTML, so the attribute sweep
    // below is the one that describes the exposure: the token is in link hrefs on this surface and nowhere
    // else, not in a `data-` attribute, a name or a value of any other kind.
    // Whatever carries it must be an href on this surface. For the Atlas fixture that is **nothing at all**,
    // because a plan that contradicts itself in none of the three ways gives the conflict list nothing to
    // link to — so the token reaches the browser only once there is a link to put it in. The case below,
    // against a plan that does contradict itself, is where an href is required to exist; asserting one here
    // would be asserting that this fixture has a conflict, which is a different claim.
    for (const [name, value] of attributesContaining(container, MANAGE_SEAT_TOKEN)) {
      expect({ name, onSurface: value.startsWith(`/s/${MANAGE_SEAT_TOKEN}/`) }).toEqual({
        name: 'href',
        onSurface: true,
      })
    }
  })

  // The half above would pass for a surface that drew no link at all, so this is what makes it a rule: a
  // plan that contradicts itself in all three ways gives the conflict list something to link to, and every
  // link it draws is a path on this surface rather than an admin one.
  it('addresses every conflict link at this surface, never at /plans, which needs a cookie', async () => {
    seated(MANAGE_SEAT_TOKEN)
    api.plans = [tangledPlan()]
    const { container } = render(await screenFor(MANAGE_SEAT_TOKEN))
    const hrefs = [...container.querySelectorAll('a')].map((one) => one.getAttribute('href') ?? '')
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href.startsWith(`/s/${MANAGE_SEAT_TOKEN}/`)).toBe(true)
    // And every attribute carrying the token is one of those hrefs, which is what makes the case above a
    // rule rather than a statement about a fixture with no links in it.
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
  // could ask a second question of it. What the screen gets is the plan, the instant, the controls and
  // three explicitly empty slots — six props and no seventh. All three slots are in the set because all
  // three are required on the screen and this surface fills none of them: it has no drawer route, a
  // conflict list links only to those routes, and a share manager would need this seat's token bound into
  // its actions — so `null` three times is what this page states about itself.
  it('hands the screen the controls and never the role, the scope or the share view itself', async () => {
    seated(WRITE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(WRITE_SEAT_TOKEN)
    expect(isValidElement(element)).toBe(true)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(Object.keys(handed).sort()).toEqual([
      'actions',
      'at',
      'bridge',
      'conflicts',
      'controls',
      'drawer',
      'groups',
      'plan',
      'progress',
      'rails',
      'settings',
      'share',
    ])
    expect(handed['drawer']).toBeNull()
    // `conflicts` is an element now, not `null`: the list takes its surface's own drawer routes, so its links
    // address `/s/<token>/…` rather than an admin path nobody here can follow. `drawer` stays `null` in this
    // case because the *screen* is called with no drawer — `layout.tsx` is what passes its children in.
    expect(handed['conflicts']).not.toBeNull()
    // The four manager slots are `null` **for this seat** and no longer for want of a mechanism. This case
    // holds a `write` token, and every action behind all four is `manage` in the kernel: the share four, the
    // five rail actions, the five group ones and the three plan ones. So each slot answers `null` because
    // this seat may not use it — which is the API's own answer restated as a rendering one — and the case
    // below proves a `manage` seat is handed all four. Both directions are needed: a surface that drew
    // nothing for anybody would satisfy this one alone.
    expect(handed['share']).toBeNull()
    expect(handed['groups']).toBeNull()
    expect(handed['rails']).toBeNull()
    expect(handed['settings']).toBeNull()
    expect((handed['controls'] as { seats: Record<string, boolean> }).seats).toEqual({
      read: false,
      create: false,
      update: false,
      revoke: false,
    })
    // `actions` is the seat's own wiring now, every member bound to the token in this page's URL. What
    // makes that safe is the pair of cases above rather than this one: they call each handed action and
    // assert the token it carries is the visitor's own and no other. Asserted here as a shape only — that
    // it is an object of functions — because which functions is `seat-actions.test.ts`'s question.
    const writes = handed['actions'] as Record<string, unknown>
    expect(Object.values(writes).every((one) => typeof one === 'function')).toBe(true)
    expect(Object.keys(writes).length).toBeGreaterThan(0)
    const groups = Object.values(handed['controls'] as Record<string, Record<string, unknown>>)
    expect(groups.flatMap((group) => Object.values(group)).every((one) => typeof one === 'boolean')).toBe(true)
  })


  // The other direction, and the case that makes the four `null`s above a rule rather than a surface that
  // draws nothing. Every action behind these slots is `manage`, so a `manage` seat is handed all four —
  // which is what a plan shared at `manage` is for: the holder can add a rail, put a feature on it, group
  // it, correct the plan’s calendar and hand on a seat of its own, without an admin cookie anywhere.
  it('hands a manage seat all four manager slots, every action behind them being manage', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const element: ReactNode = await screenFor(MANAGE_SEAT_TOKEN)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    for (const slot of ['share', 'groups', 'rails', 'settings']) {
      expect(handed[slot], slot).not.toBeNull()
    }
  })

  // A view seat is the floor: it may select a group from the chips the heading draws and edit nothing, so
  // every manager slot is refused it as well.
  it('hands a view seat none of them, the chips it can use being the heading’s own', async () => {
    seated(SEAT_TOKEN)
    const element: ReactNode = await screenFor(SEAT_TOKEN)
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    for (const slot of ['share', 'groups', 'rails', 'settings']) {
      expect(handed[slot], slot).toBeNull()
    }
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
