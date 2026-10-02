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

const tabOf = (): Element | null => document.querySelector('[data-slot="panel-tab"]')

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
  ])('draws %s in a panel tabbed %s', async (_what, open, title) => {
    render(await open())
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title)
    expect(dockOf()).toBeTruthy()
    // The one way out, on all four, and it is a link to the plan's own path — so the tab's close, the
    // browser's Back and a bookmark of the plan all mean one thing.
    expect(closeOf()).toBe(planPath(PLAN_A))
    expect(tabOf()?.contains(closeLink())).toBe(true)
  })
})

// ADR 0068 §6, and the restyle. Through phase 4 the dock was a bordered panel that scrolled as a whole,
// with a text link reading `Close` at the very bottom — past however many fields the subject had. That
// became a right-hand dock with a scrim, a title bar and a scrolling body; it is a **bottom panel** now,
// and `drawer/panel-css.ts` carries why: the dock covered the bars a reader had just clicked, the scrim
// said *finish here first* about a page whose point is that a plan is read while it is changed, and 28rem
// is a column. All four routes take the frame from `drawer-dock.tsx` without asking for it, so one route
// can stand for the rest here; the case above is what checks that each of the four is handed it.
describe('the panel they open in: a grip, a tab that keeps the way out on screen, a body that scrolls', () => {
  it('puts the way out in the tab beside the name, and not under the fields', async () => {
    render(await RailDrawerPage(railParams(EPIC_1)))
    const tab = tabOf()
    expect(tab?.contains(closeLink())).toBe(true)
    expect(closeLink().textContent).toBe(String.fromCharCode(0x2715))
    expect(tab?.querySelector('h2')?.textContent).toBe('Platform')
    expect(tab?.querySelector('input')).toBeNull()
  })

  it('scrolls the fields under that strip rather than the panel, so a long form cannot push it away', async () => {
    render(await RailDrawerPage(railParams(EPIC_1)))
    const pane = dockOf()?.lastElementChild
    expect(pane?.querySelector('input')).toBeTruthy()
    expect(pane?.className).toContain('overflow-y-auto')
    expect(dockOf()?.className).not.toContain('overflow-y-auto')
  })

  // What left with the right-hand dock. There is no scrim, and nothing to click away from: the board
  // beside the panel is live, and a click on it opens whatever was clicked rather than dismissing this.
  it('dims nothing and covers nothing, the board above it merely being shorter', async () => {
    render(await NewRailPage(newRail))
    expect(document.querySelector('[aria-hidden="true"][tabindex="-1"]')).toBeNull()
    expect(dockOf()?.className).not.toContain('fixed')
    expect(dockOf()?.className).toContain('shrink-0')
    expect(screen.getAllByRole('link', { name: 'Close' })).toHaveLength(1)
  })

  // The height is an inline `var()` with a fallback, so the panel opens at its own size with no
  // JavaScript at all and a reader who has dragged it gets their own the moment the grip restores it.
  it('opens at its own height without JavaScript, and offers a grip a keyboard can reach', async () => {
    render(await NewRailPage(newRail))
    expect(dockOf()?.getAttribute('style')).toContain('var(--plan-panel, 360px)')
    expect(screen.getByRole('button', { name: /resize the panel/ })).toBeTruthy()
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
