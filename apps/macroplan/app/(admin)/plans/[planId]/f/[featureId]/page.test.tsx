import { seal } from '@repo/app-session/crypto'
import { render, screen } from '@testing-library/react'
import { isValidElement, type ReactNode } from 'react'
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
import {
  ADMIN_TOKEN,
  atlasPlan,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  PLAN_A,
  PLAN_GONE,
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

// The same walk `layout.test.tsx` carries, for the same reason: this page reads the very plan the
// API answers an admin with every live token on, so "no token reaches a component" has to be checked
// here too rather than inherited from the surface one segment up. Functions are collected and
// asserted empty because a bound argument is unreachable by reflection (ADR 0040), and this page
// binds nothing.
const sweep = (value: unknown, found: { strings: string[]; functions: string[] }, seen: WeakSet<object>): void => {
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
  if (isValidElement(value) && typeof value.key === 'string') found.strings.push(value.key)
  for (const child of Object.values(isValidElement(value) ? (value.props as object) : value)) {
    sweep(child, found, seen)
  }
}

const handedBy = (element: ReactNode) => {
  const found = { strings: [] as string[], functions: [] as string[] }
  sweep(element, found, new WeakSet())
  return found
}

describe('the drawer one feature is open in', () => {
  it('names the feature the URL names, and no other feature of the plan', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 2, name: 'Auth rewrite' })).toBeTruthy()
    expect(screen.queryByText('Billing')).toBeNull()
  })

  it('says the same words the table row says about it, rather than wording them again', async () => {
    await show()
    expect(valueOf('Epic')).toBe('Platform')
    expect(valueOf('Estimate')).toBe('5d')
    expect(valueOf('Sprint')).toBe('S1')
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
})

describe('what the drawer reads, and how often', () => {
  it('reads the one plan under the bearer the admin cookie carries, and reads nothing else', async () => {
    await show()
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
  })

  it('reads it under the very key the layout reads it under, so one cached entry serves both', async () => {
    await FeatureDrawerPage(propsOf(FEATURE_1))
    await PlanLayout({ params: Promise.resolve({ planId: PLAN_A }), children: null })
    const both = trace(api)
    expect(both).toHaveLength(2)
    expect(both[0]).toBe(both[1])
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

  it('hands the panel one row and a path, and never the plan it found the row in', async () => {
    const element = await FeatureDrawerPage(propsOf(FEATURE_1))
    const handed = isValidElement<Record<string, unknown>>(element) ? element.props : {}
    expect(Object.keys(handed).sort()).toEqual(['closeHref', 'row'])
  })

  it('hands over no function at all, so no token is hiding in a bound action’s arguments', async () => {
    expect(handedBy(await FeatureDrawerPage(propsOf(FEATURE_1))).functions).toEqual([])
  })
})
