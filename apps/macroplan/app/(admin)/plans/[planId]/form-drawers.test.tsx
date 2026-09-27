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

// One file for six routes, which is a departure from the page-per-test-file shape the two subject drawers
// use — and it is deliberate. Each of these needs the same sixty lines of cookie, navigation and fetch
// doubling, and none of them needs anything the others do not: they are one decision (design §4 — every form
// becomes a drawer route) checked six times. The two subject drawers keep their own files because each has a
// subject resolution and a not-found boundary that is genuinely its own.
const { default: NewRailPage } = await import('./new/rail/page')
const { default: NewGroupPage } = await import('./new/group/page')
const { default: RailDrawerPage } = await import('./r/[epicId]/page')
const { default: GroupDrawerPage } = await import('./g/[labelId]/page')
const { default: PlanSettingsPage } = await import('./settings/page')
const { default: PlanSharePage } = await import('./share/page')

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

const railParams = (epicId: string) => ({ params: Promise.resolve({ planId: PLAN_A, epicId }) })

const groupParams = (labelId: string) => ({ params: Promise.resolve({ planId: PLAN_A, labelId }) })

const closeOf = (): string | null =>
  screen.getByText('Close').getAttribute('href')

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
    ['a new rail', async () => NewRailPage(planOnly), 'Add a rail'],
    ['a new group', async () => NewGroupPage(planOnly), 'Add a group'],
    ['plan settings', async () => PlanSettingsPage(planOnly), 'Plan settings'],
    ['sharing', async () => PlanSharePage(planOnly), 'Share this plan'],
    ['one rail', async () => RailDrawerPage(railParams(EPIC_1)), 'Platform'],
    ['one group', async () => GroupDrawerPage(groupParams(LABEL_1)), 'Phase 1'],
  ])('draws %s in a shell headed %s', async (_what, open, title) => {
    render(await open())
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(title)
    expect(document.querySelector('[data-slot="drawer-shell"]')).toBeTruthy()
    expect(closeOf()).toBe(planPath(PLAN_A))
  })
})

describe('the two make-one routes ask the API nothing', () => {
  // A new rail's form is a name and a colour, neither of which depends on what the plan holds, and
  // `createEpic` appends after the last rail without being told where. So there is nothing to read.
  it.each([
    ['rail', async () => NewRailPage(planOnly)],
    ['group', async () => NewGroupPage(planOnly)],
  ])('makes no request to draw the new %s form', async (_what, open) => {
    await open()
    expect(trace(api)).toEqual([])
  })

  it('hands the new-rail form its create action by name, and nothing bound', async () => {
    const handed = handedBy(await NewRailPage(planOnly))
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

// The guard that moved here from `layout.test.tsx`. Those seven actions were handed from the layout while
// the share manager and the settings panel were disclosures in the plan heading; they are handed from these
// two routes now, and ADR 0040's check has to live where the action does — a bound action is the one way a
// token reaches a component invisibly, and `Function.prototype.bind` names its result `bound <name>`.
describe('the two plan-level routes hand their own actions, by name and nothing bound', () => {
  it('hands settings exactly the three plan-own writes', async () => {
    const handed = handedBy(await PlanSettingsPage(planOnly))
    expect([...new Set(handed.functions)].sort()).toEqual(['deletePlan', 'renamePlan', 'retimePlan'])
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
  })

  it('hands sharing exactly the four seat writes', async () => {
    const handed = handedBy(await PlanSharePage(planOnly))
    expect([...new Set(handed.functions)].sort()).toEqual([
      'createPlanSeat',
      'readPlanSeats',
      'revokePlanSeat',
      'updatePlanSeat',
    ])
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
  })

  // The share route reads the plan not at all, which is what keeps every live token out of its payload: the
  // admin's plan read answers `shareLinks` in full (ADR 0033), and `ShareManager` fetches its own seats.
  it('reads no plan to draw the share manager, so no seat reaches the payload', async () => {
    await PlanSharePage(planOnly)
    expect(trace(api)).toEqual([])
  })

  it('hands no token down from either, checked against the three the fixture really has', async () => {
    const tokens = atlasPlan().shareLinks.map((seat) => seat.token)
    expect(tokensHandedBy(await PlanSharePage(planOnly), tokens)).toEqual([])
    expect(tokensHandedBy(await PlanSettingsPage(planOnly), tokens)).toEqual([])
  })
})

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
    expect(screen.getByText(/features in this group/)).toBeTruthy()
    const handed = handedBy(await GroupDrawerPage(groupParams(LABEL_1)))
    for (const write of ['renameLabel', 'recolourLabel', 'removeLabel']) {
      expect(handed.functions).toContain(write)
    }
  })

  it('is notFound for a label id the plan does not hold', async () => {
    expect(await thrownBy(() => GroupDrawerPage(groupParams(NO_SUCH_GROUP)))).toBeInstanceOf(NotFound)
  })
})
