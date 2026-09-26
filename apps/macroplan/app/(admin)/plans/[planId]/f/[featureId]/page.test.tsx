import { seal } from '@repo/app-session/crypto'
import { render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  planReadKey,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../../../../../components/plan/testing/fake-plan-api'
import { ADMIN_PLAN_ACTIONS } from '../../../../../../components/plan/admin-actions'
import { handedBy } from '../../../../../../components/plan/testing/handed'
import {
  ADMIN_TOKEN,
  atlasPlan,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  PLAN_A,
  PLAN_GONE,
  unplacedPlan,
} from '../../../../../../components/plan/testing/plan-fixture'
import { payloadOf } from '../../../../../../lib/principal'
import { planPath } from '../../../../../../lib/routes'

const SECRET = 'a-cookie-secret-of-at-least-32-by'

const NO_SUCH_FEATURE = '01MPFFFFFFFFFFFFFFFFFFFFF9'

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
  // The drawer's delete navigates on success, so the panel holds a component that calls `useRouter`,
  // which throws outside an App Router tree. Nothing here clicks it; it only has to exist for a render.
  useRouter: () => ({
    back: () => undefined,
    forward: () => undefined,
    prefetch: () => undefined,
    push: () => undefined,
    refresh: () => undefined,
    replace: () => undefined,
  }),
}))
vi.mock('next/link', async () => ({
  default: (await import('../../../../../../components/plan/testing/next-link')).LinkDouble,
}))

const { default: FeatureDrawerPage } = await import('./page')

const { default: PlanLayout } = await import('../../layout')

let api: FakePlanApiState

const answered: unknown[] = []

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', SECRET)
  api = fakePlanApiState()
  api.plans = [atlasPlan()]
  answered.length = 0
  const fake = fakePlanFetch(api)
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const answer = await fake(url, init)
    answered.push(await answer.clone().json())
    return answer
  })
  bearer = ADMIN_TOKEN
  holdingAdmin(api)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const propsOf = (featureId: string, planId = PLAN_A) => ({
  params: Promise.resolve({ planId, featureId }),
})

const show = async (featureId = FEATURE_1, planId = PLAN_A) =>
  render(await FeatureDrawerPage(propsOf(featureId, planId)))

const thrownBy = async (featureId: string, planId = PLAN_A): Promise<unknown> => {
  try {
    await FeatureDrawerPage(propsOf(featureId, planId))
  } catch (error) {
    return error
  }
  throw new Error('nothing was thrown')
}

const valueOf = (label: string): string =>
  [...document.querySelectorAll('dt')]
    .filter((node) => node.textContent === label)
    .map((node) => node.nextElementSibling?.textContent ?? '')
    .join('')

const EVERY_TOKEN = atlasPlan().shareLinks.map((seat) => seat.token)

// The same walk `layout.test.tsx` runs, out of the one module the three of them share, for the same
// reason: this page reads the very plan the API answers an admin with every live token on, so "no
// token reaches a component" has to be checked here too rather than inherited from the surface one
// segment up. Functions are collected and asserted by name because a bound argument is unreachable by
// reflection — which is a fact about `bind` and not an ADR's claim — and binding is the mechanism ADR
// 0040 describes for handing a token to a component. This page binds nothing.

describe('the drawer one feature is open in', () => {
  // The panel is open on **one** subject, and the other feature of the plan is on screen for exactly
  // one reason: it is a dependency candidate. So the claim is that the heading is this feature's and
  // that nothing else is drawn as a subject — not that no other name appears, which the candidate list
  // makes false on purpose (`components/plan/drawer/dependency-editor.tsx`).
  it('names the feature the URL names as its subject, and every other one only as a candidate', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Billing' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Billing' })).toBeTruthy()
  })

  it('says the same words the table row says about it, rather than wording them again', async () => {
    await show()
    expect(valueOf('Epic')).toBe('Platform')
    expect(valueOf('Estimate')).toBe('5d')
    expect(valueOf('Sprint')).toBe('S1')
  })

  // The case above cannot fail: `atlasPlan()`'s first feature is authored at 5 days and its items add
  // up to 5, so §3.2's compound form collapses to a bare `5d` — which is exactly what a panel
  // formatting `feature.estimateDays` itself would print. The two below are the ones that make
  // resolving the subject through `tableRows` load-bearing: neither wording exists anywhere but
  // `rows.ts`, so a re-implementation here could not produce either by accident.
  it('states the gap between what was authored and what was broken down, in the row’s own words', async () => {
    const base = atlasPlan()
    api.plans = [
      atlasPlan({
        features: base.features.map((one) =>
          one.id === FEATURE_1 ? { ...one, estimateDays: 40 } : one,
        ),
      }),
    ]
    await show()
    expect(valueOf('Estimate')).toBe('planned 40d · broken down to 5d · -35d')
  })

  it('says why a feature has no sprint at all, which is a sentence and not a number', async () => {
    api.plans = [unplacedPlan('in-cycle')]
    await show(FEATURE_2)
    expect(valueOf('Sprint')).toBe('not placed · in a dependency cycle')
    expect(screen.getByRole('heading', { level: 2, name: 'Billing' })).toBeTruthy()
  })

  it('opens the plan’s second feature at its own address, so a selection can be linked to', async () => {
    await show(FEATURE_2)
    expect(screen.getByRole('heading', { level: 2, name: 'Billing' })).toBeTruthy()
  })

  it('names the rail the canvas draws for a feature no epic claims, rather than refusing it', async () => {
    api.plans = [atlasPlan({ epics: [] })]
    await show()
    expect(valueOf('Epic')).toBe('Unclaimed rail')
  })

  it('closes back to the plan’s own URL, which is the same address with nothing selected', async () => {
    await show()
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe(planPath(PLAN_A))
  })

  it('draws the two fields an admin may write, seeded from the record rather than from the words', async () => {
    await show()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Feature name' }).value).toBe(
      'Auth rewrite',
    )
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe(
      '5',
    )
  })

  // The sentence and the number, side by side out of one read: nothing parses `-35d` back into a field,
  // and nothing formats `40` into the `<dd>`.
  it('puts the authored estimate in the field while the list keeps the schedule’s sentence', async () => {
    const base = atlasPlan()
    api.plans = [
      atlasPlan({
        features: base.features.map((one) =>
          one.id === FEATURE_1 ? { ...one, estimateDays: 40 } : one,
        ),
      }),
    ]
    await show()
    expect(valueOf('Estimate')).toBe('planned 40d · broken down to 5d · -35d')
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe(
      '40',
    )
  })

  it('draws no description box, a feature having no description and no action to write one', async () => {
    await show()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
  })
})

describe('what the drawer reads, and how often', () => {
  it('reads the one plan under the bearer the admin cookie carries, and reads nothing else', async () => {
    await show()
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
  })

  // Three requests between them and not four: the drawer reads the plan, the layout reads the plan
  // again under the same key, and the layout also reads the bridge, which the drawer does not need. The
  // two plan reads being byte-identical is the point — `cache()` collapses them inside one render, and
  // this asserts the key rather than the collapsing, since two separate calls here are two renders.
  it('reads the plan under the very key the layout reads it under, so one cached entry serves both', async () => {
    await FeatureDrawerPage(propsOf(FEATURE_1))
    await PlanLayout({ params: Promise.resolve({ planId: PLAN_A }), children: null })
    const seen = trace(api)
    const plans = seen.filter((one) => !one.includes('/bridge'))
    expect(plans).toHaveLength(2)
    expect(plans[0]).toBe(plans[1])
    expect(seen.filter((one) => one.includes('/bridge'))).toHaveLength(1)
  })

  it('sends an expired admin back to the plan, one cached read knowing that path and not this one', async () => {
    bearer = null
    const thrown = await thrownBy(FEATURE_1)
    expect(thrown).toBeInstanceOf(Redirected)
    expect(thrown instanceof Redirected ? thrown.location : '').toBe(
      `/login?next=%2Fplans%2F${PLAN_A}`,
    )
    expect(trace(api)).toEqual([])
  })
})

describe('an id that names nothing', () => {
  it('renders not-found for a feature this plan does not hold, not an empty drawer', async () => {
    expect(await thrownBy(NO_SUCH_FEATURE)).toBeInstanceOf(NotFound)
  })

  it('renders not-found for an id that names an item, the two segments not answering for each other', async () => {
    expect(await thrownBy(ITEM_1)).toBeInstanceOf(NotFound)
  })

  it('renders not-found for a plan the workspace does not hold, as the layout does', async () => {
    expect(await thrownBy(FEATURE_1, PLAN_GONE)).toBeInstanceOf(NotFound)
  })

  it('draws nothing at all when the read was refused, the layout having said that once already', async () => {
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    const element = await FeatureDrawerPage(propsOf(FEATURE_1))
    expect(element).toBeNull()
    render(element)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('the drawer hands no share token to a component either', () => {
  it('was answered all three on the wire, so what follows is a reduction and not a thin plan', async () => {
    await FeatureDrawerPage(propsOf(FEATURE_1))
    const wire = JSON.stringify(answered)
    for (const token of EVERY_TOKEN) expect(wire).toContain(token)
  })

  it('hands not one of them to a component, and renders none of them', async () => {
    const element = await FeatureDrawerPage(propsOf(FEATURE_1))
    const { container } = render(element)
    const handed = handedBy(element)
    expect(handed.strings.filter((one) => EVERY_TOKEN.some((token) => one.includes(token)))).toEqual(
      [],
    )
    for (const token of EVERY_TOKEN) expect(container.innerHTML).not.toContain(token)
  })

  it('hands the panel one row, its values, a path and the writes — never the plan they came from', async () => {
    const element = await FeatureDrawerPage(propsOf(FEATURE_1))
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(Object.keys(handed).sort()).toEqual([
      'actions',
      'closeHref',
      'controls',
      'description',
      'link',
      'planId',
      'row',
      'values',
    ])
    // A feature has no link to show: design §7.2 gives one to an item, which references a task within
    // its epic's bound project. The slot is required so that `link={null}` is a sentence this page
    // states rather than a prop nobody passed.
    expect(handed['link']).toBeNull()
    expect(handed['values']).toEqual({
      name: 'Auth rewrite',
      estimateDays: 5,
      pinSprint: null,
      place: {
        featureId: FEATURE_1,
        railId: EPIC_1,
        siblingIds: [FEATURE_1, FEATURE_2],
        targets: [],
      },
      plan: {
        calendar: { startDate: '2026-09-28', sprintLengthDays: 14, timezone: 'Europe/Belgrade' },
        features: atlasPlan().features,
        labels: atlasPlan().labels,
      },
      sizedByItems: true,
    })
    expect(handed['description']).toBeNull()
  })

  // What `handed.ts` asks of the first surface to hand a function over: every one of these is a module
  // function imported by name, so reflection can see all there is to see of it. A **bound** action is
  // the shape that could carry a token invisibly — `action.bind(null, token)` exposes neither — and
  // `Function.prototype.bind` names its result `bound <name>`, which is what this rules out.
  it('hands over every write by name and nothing bound, so no token hides in an action’s arguments', async () => {
    const handed = handedBy(await FeatureDrawerPage(propsOf(FEATURE_1)))
    expect([...handed.functions].sort()).toEqual(Object.keys(ADMIN_PLAN_ACTIONS).sort())
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
    expect(handed.functions.filter((name) => name === '')).toEqual([])
  })
})
