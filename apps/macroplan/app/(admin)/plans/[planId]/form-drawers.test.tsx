import { seal } from '@repo/app-session/crypto'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  trace,
  type FakePlanApiState,
} from '../../../../components/plan/testing/fake-plan-api'
import { handedBy, tokensHandedBy } from '../../../../components/plan/testing/handed'
import {
  ADMIN_TOKEN,
  atlasPlan,
  EPIC_1,
  LABEL_1,
  PLAN_A,
} from '../../../../components/plan/testing/plan-fixture'
import { payloadOf } from '../../../../lib/principal'
import { planPath } from '../../../../lib/routes'

const SECRET = 'a-cookie-secret-of-at-least-32-by'

const NO_SUCH_RAIL = '01MPEEEEEEEEEEEEEEEEEEEEE7'

const NO_SUCH_GROUP = '01MPGPGPGPGPGPGPGPGPGPGPG7'

class NotFound extends Error {}

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: () => ({
        name: 'mp_admin',
        value: seal(SECRET, payloadOf({ kind: 'admin', token: ADMIN_TOKEN })),
      }),
      set: () => undefined,
    }),
  headers: () => Promise.resolve(new Headers()),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('notFound')
  },
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

vi.mock('next/link', async () => ({
  default: (await import('../../../../components/plan/testing/next-link')).LinkDouble,
}))

// One file for four routes, which is a departure from the page-per-test-file shape the two subject drawers
// use — and it is deliberate. Each of these needs the same sixty lines of cookie, navigation and fetch
// doubling, and none of them needs anything the others do not: they are one decision (design §4 — every form about
// something *in* the plan becomes a drawer route) checked four times. The two subject drawers keep their own files because each has a
// subject resolution and a not-found boundary that is genuinely its own.
const { default: NewRailPage } = await import('./new/rail/page')
const { default: NewGroupPage } = await import('./new/group/page')
const { default: RailDrawerPage } = await import('./r/[epicId]/page')
const { default: GroupDrawerPage } = await import('./g/[labelId]/page')

let api: FakePlanApiState

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  api = fakePlanApiState()
  holdingAdmin(api)
  api.plans = [atlasPlan()]
  vi.stubGlobal('fetch', fakePlanFetch(api))
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const planOnly = { params: Promise.resolve({ planId: PLAN_A }) }

// The new-rail route also reads `?n=`, the count of rails the plan already holds, so the form can
// propose a hue no other rail has. It is a search param and not a read precisely so that this route
// stays request-free, which is what the group below asserts — `lib/drawer-routes.ts` carries why.
const newRail = { ...planOnly, searchParams: Promise.resolve({ n: '2' }) }

const railParams = (epicId: string) => ({ params: Promise.resolve({ planId: PLAN_A, epicId }) })

const groupParams = (labelId: string) => ({ params: Promise.resolve({ planId: PLAN_A, labelId }) })

// The way out is a `✕` with `aria-label="Close"` and no readable text of its own, so it is found the
// way a reader finds it: by its accessible name, which is also the assertion that it has one.
const closeLink = (): HTMLElement => screen.getByRole('link', { name: 'Close' })

const closeOf = (): string | null => closeLink().getAttribute('href')

const dockOf = (): Element | null => document.querySelector('[data-slot="drawer-shell"]')

// The scrim is hidden from the accessibility tree on purpose, so no role query can reach it and its
// place is what identifies it: the one element drawn immediately before the dock.
const scrimOf = (): Element | null => dockOf()?.previousElementSibling ?? null

const thrownBy = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    await run()
  } catch (error) {
    return error
  }
  throw new Error('nothing was thrown')
}

describe('every form is a drawer route, and every one of them closes back to the plan', () => {
  it.each([
    ['a new rail', async () => NewRailPage(newRail), 'Add a rail'],
    ['a new group', async () => NewGroupPage(planOnly), 'Add a group'],
    ['one rail', async () => RailDrawerPage(railParams(EPIC_1)), 'Platform'],
    ['one group', async () => GroupDrawerPage(groupParams(LABEL_1)), 'Phase 1'],
  ])('draws %s in a shell headed %s', async (_what, open, title) => {
    render(await open())
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title)
    expect(dockOf()).toBeTruthy()
    // Both ways out, on all four: the control in the title bar and the scrim over the page behind it
    // address the same plan, so clicking away and clicking Close cannot end up meaning two things.
    expect(closeOf()).toBe(planPath(PLAN_A))
    expect(scrimOf()?.getAttribute('href')).toBe(planPath(PLAN_A))
  })
})

// ADR 0068 §6. Through phase 4 the dock was a bordered panel that scrolled as a whole, with a text link
// reading `Close` at the very bottom — past however many fields the subject had, which on plan settings or
// a rail's three forms meant the only way out was off screen until you scrolled to find it, and the plan
// behind it stayed fully lit. The dock is a scrim, a title bar that keeps the way out in place, and a body
// that scrolls under it. All four routes take all three from `drawer-dock.tsx` without asking for them, so
// one route can stand for the rest here: what these check is the dock a route is handed, and the case above
// is what checks that each of the four is handed it.
describe('the dock they open in: a scrim, a bar that keeps the way out on screen, a body that scrolls', () => {
  it('puts the way out in the title bar beside the name, and not under the fields', async () => {
    render(await RailDrawerPage(railParams(EPIC_1)))
    const bar = dockOf()?.firstElementChild
    expect(bar?.contains(closeLink())).toBe(true)
    expect(closeLink().textContent).toBe('✕')
    expect(bar?.querySelector('h2')?.textContent).toBe('Platform')
    expect(bar?.querySelector('input')).toBeNull()
  })

  it('scrolls the fields under that bar rather than the drawer, so a long form cannot push it away', async () => {
    render(await RailDrawerPage(railParams(EPIC_1)))
    const pane = dockOf()?.lastElementChild
    expect(pane?.querySelector('input')).toBeTruthy()
    expect(pane?.className).toContain('overflow-y-auto')
    expect(dockOf()?.className).not.toContain('overflow-y-auto')
  })

  it('dims the plan behind with an anchor, so clicking away closes the drawer with no JavaScript', async () => {
    render(await NewRailPage(newRail))
    expect(scrimOf()?.tagName).toBe('A')
    expect(scrimOf()?.getAttribute('href')).toBe(planPath(PLAN_A))
  })

  it('keeps that scrim out of the reading order, a second unnamed stop over the page being worse', async () => {
    render(await NewRailPage(newRail))
    expect(scrimOf()?.getAttribute('aria-hidden')).toBe('true')
    expect(scrimOf()?.getAttribute('tabindex')).toBe('-1')
    expect(screen.getAllByRole('link', { name: 'Close' })).toHaveLength(1)
  })

  // The chrome moved into a file `DrawerPanel` shares, so this is the invariant that could have been
  // dropped in the move without a form route noticing: a drawer is a route, not an overlay.
  it('is still an aside named by its own heading, and still claims no dialog role', async () => {
    render(await GroupDrawerPage(groupParams(LABEL_1)))
    const dock = dockOf()
    expect(dock?.tagName).toBe('ASIDE')
    expect(dock?.getAttribute('aria-labelledby')).toBe(dock?.querySelector('h2')?.id)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('the two make-one routes ask the API nothing', () => {
  // A new rail's form is a name and a colour, and the count that decides the colour rides in on the
  // URL. So there is still nothing to read.
  it.each([
    ['rail', async () => NewRailPage(newRail)],
    ['group', async () => NewGroupPage(planOnly)],
  ])('makes no request to draw the new %s form', async (_what, open) => {
    await open()
    expect(trace(api)).toEqual([])
  })

  it('hands the new-rail form its create action by name, and nothing bound', async () => {
    const handed = handedBy(await NewRailPage(newRail))
    expect(handed.functions).toContain('createEpic')
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
    expect(handed.functions.filter((name) => name === '')).toEqual([])
  })

  it('hands the new-group form its create action by name, and nothing bound', async () => {
    const handed = handedBy(await NewGroupPage(planOnly))
    expect(handed.functions).toContain('createLabel')
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
  })
})

// The two plan-level guards are not here any more. Settings and sharing stopped being routes in the
// restyle — both are menus in the plan head row, handed their actions by `admin-slots.tsx` — so the check
// that neither hands a bound action moved with them, to `admin-slots.test.tsx`. ADR 0040’s rule is
// unchanged and so is the reason for it: a bound action is the one way a token reaches a component
// invisibly, and `Function.prototype.bind` names its result `bound <name>`.

describe('the rail drawer, which is where a binding lives now', () => {
  it('names the rail it opened and offers the rail writes by name', async () => {
    const handed = handedBy(await RailDrawerPage(railParams(EPIC_1)))
    for (const write of ['renameEpic', 'recolourEpic', 'reorderEpic', 'removeEpic']) {
      expect(handed.functions).toContain(write)
    }
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
  })

  // The one `write`-tier control on a page whose rail controls are all `manage`: a reader may be able to add
  // a feature to a rail it may not rename, so the two halves are drawn on their own answers.
  it('offers adding a feature to that rail, which is the write-tier half', async () => {
    expect(handedBy(await RailDrawerPage(railParams(EPIC_1))).functions).toContain('createFeature')
  })

  it('offers binding it to a Microtask project, and says it is bound to nothing yet', async () => {
    render(await RailDrawerPage(railParams(EPIC_1)))
    expect(screen.getByText(/not bound to a Microtask project/)).toBeTruthy()
    const handed = handedBy(await RailDrawerPage(railParams(EPIC_1)))
    expect(handed.functions).toContain('bindEpic')
    expect(handed.functions).toContain('unbindEpic')
  })

  // Two ways in, and the order is the recommendation: naming a project needs no credential in a browser at
  // all, and pasting a token stays below it for a Microtask this admin has no session for.
  it('offers naming the project first, which is the path on which no token is ever typed', async () => {
    render(await RailDrawerPage(railParams(EPIC_1)))
    const labels = [...document.querySelectorAll('p')].map((one) => one.textContent ?? '')
    expect(labels.findIndex((one) => one.startsWith('Bind to a project'))).toBeGreaterThan(-1)
    expect(labels.findIndex((one) => one.startsWith('Bind to a project'))).toBeLessThan(
      labels.findIndex((one) => one.startsWith('Or paste a token')),
    )
    expect(handedBy(await RailDrawerPage(railParams(EPIC_1))).functions).toContain('bindEpicProject')
  })

  it('hands no token down, the sealed binding never leaving the server', async () => {
    const tokens = atlasPlan().shareLinks.map((seat) => seat.token)
    expect(tokensHandedBy(await RailDrawerPage(railParams(EPIC_1)), tokens)).toEqual([])
  })

  it('is notFound for a rail id the plan does not hold, and never an empty panel', async () => {
    expect(await thrownBy(() => RailDrawerPage(railParams(NO_SUCH_RAIL)))).toBeInstanceOf(NotFound)
  })
})

describe('the group drawer', () => {
  it('names the group, counts what is in it, and offers the three label writes', async () => {
    render(await GroupDrawerPage(groupParams(LABEL_1)))
    expect(screen.getByText(/in this group/)).toBeTruthy()
    const handed = handedBy(await GroupDrawerPage(groupParams(LABEL_1)))
    for (const write of ['renameLabel', 'recolourLabel', 'removeLabel']) {
      expect(handed.functions).toContain(write)
    }
  })

  // ADR 0064 kept membership off this drawer, on the grounds that it would be a second place to write
  // one pointer. It is a second place to *invoke* one write against one record, which is the thing the
  // objection was not about — so the assertion is that it is the same write the feature's own drawer
  // sends, and that every feature is offered rather than only the ones already in.
  it('fills the group from here too, over the same feature:label write and no other', async () => {
    render(await GroupDrawerPage(groupParams(LABEL_1)))
    const boxes = document.querySelectorAll('[data-slot="group-members"] input[type="checkbox"]')
    const handed = handedBy(await GroupDrawerPage(groupParams(LABEL_1)))

    expect(boxes.length).toBe(atlasPlan().features.length)
    expect(handed.functions).toContain('labelFeature')
  })

  it('is notFound for a label id the plan does not hold', async () => {
    expect(await thrownBy(() => GroupDrawerPage(groupParams(NO_SUCH_GROUP)))).toBeInstanceOf(NotFound)
  })
})
