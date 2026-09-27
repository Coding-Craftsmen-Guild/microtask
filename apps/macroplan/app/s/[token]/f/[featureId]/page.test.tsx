import { render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingSeat,
  type FakePlanApiState,
} from '../../../../../components/plan/testing/fake-plan-api'
import {
  atlasPlan,
  FEATURE_1,
  ITEM_1,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  SEAT_TOKEN,
} from '../../../../../components/plan/testing/plan-fixture'
import { linkPath } from '../../../../../lib/routes'

const NO_SUCH_FEATURE = '01MPFFFFFFFFFFFFFFFFFFFFF9'

class NotFound extends Error {}

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

// A `/s/*` page authenticates from its own URL, so a cookie or header read anywhere under it fails this file
// rather than passing quietly (ADR 0040).
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a seat drawer must not read a cookie')
  },
  headers: () => {
    throw new Error('a seat drawer must not read a header')
  },
}))

// `useRouter` is stubbed because the drawer's client fields reach for it, and `redirect` because a refused
// read on this surface redirects rather than answering — both would otherwise fail as missing exports of a
// partial mock rather than as anything about this page.
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('notFound')
  },
  redirect: (location: string) => {
    throw new Redirected(location)
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}))

let api: FakePlanApiState

const { default: SeatFeatureDrawerPage } = await import('./page')

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakePlanApiState()
  api.plans = [atlasPlan()]
  vi.stubGlobal('fetch', fakePlanFetch(api))
})

const seated = (token: string): string => {
  const stored = atlasPlan().shareLinks.find((seat) => seat.token === token)
  if (stored === undefined) throw new Error(`the fixture holds no seat ${token}`)
  holdingSeat(api, PLAN_A, stored.role, token)
  return token
}

const open = async (token: string, featureId = FEATURE_1) =>
  SeatFeatureDrawerPage({ params: Promise.resolve({ token, featureId }) })

const propsOf = async (token: string, featureId = FEATURE_1): Promise<Record<string, unknown>> => {
  const element = await open(token, featureId)
  return isValidElement<Record<string, unknown>>(element) ? element.props : {}
}

describe('a seat opens one feature beside the plan its token opens', () => {
  it('draws the panel for a feature the plan holds', async () => {
    seated(MANAGE_SEAT_TOKEN)
    render(await open(MANAGE_SEAT_TOKEN))
    expect(screen.getByText('Auth rewrite')).toBeTruthy()
  })

  // The plan id is not in this URL and is not taken from one: it comes from the bootstrap, which is the API's
  // own answer about what this token is rooted in. So there is no field in the address for a hand edit to
  // point at another plan.
  it('reads the plan the bootstrap named, there being no plan id in the address at all', async () => {
    seated(MANAGE_SEAT_TOKEN)
    expect((await propsOf(MANAGE_SEAT_TOKEN))['planId']).toBe(PLAN_A)
  })

  it('closes back to this seat’s own page, never to an admin path', async () => {
    seated(MANAGE_SEAT_TOKEN)
    expect((await propsOf(MANAGE_SEAT_TOKEN))['closeHref']).toBe(linkPath(MANAGE_SEAT_TOKEN))
  })

  it('is notFound for a feature the plan does not hold, rather than an empty panel', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await expect(open(MANAGE_SEAT_TOKEN, NO_SUCH_FEATURE)).rejects.toThrow(NotFound)
  })

  // The two segments cannot answer for each other: the kind is checked, so an item id here is a stale link
  // rather than a mis-styled panel.
  it('is notFound for an item id in the feature segment', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await expect(open(MANAGE_SEAT_TOKEN, ITEM_1)).rejects.toThrow(NotFound)
  })

  it('draws no description box, a description belonging to an item’s own file', async () => {
    seated(MANAGE_SEAT_TOKEN)
    expect((await propsOf(MANAGE_SEAT_TOKEN))['description']).toBeNull()
  })

  it('draws no link field, a task link belonging to an item and not a feature', async () => {
    seated(MANAGE_SEAT_TOKEN)
    expect((await propsOf(MANAGE_SEAT_TOKEN))['link']).toBeNull()
  })
})

describe('what the seat’s own role draws in the drawer', () => {
  // A control is a rendering answer and the API is the gate, so a view seat reaches this page and is drawn no
  // editable field. That is the correct outcome rather than a refusal.
  it('hands a view seat the content controls with every one of them false', async () => {
    seated(SEAT_TOKEN)
    const controls = (await propsOf(SEAT_TOKEN))['controls'] as Record<string, boolean>
    expect(Object.values(controls).every((one) => one === false)).toBe(true)
  })

  it('hands a manage seat the content controls with the rail and feature ones true', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const controls = (await propsOf(MANAGE_SEAT_TOKEN))['controls'] as Record<string, boolean>
    expect(controls['renameFeature']).toBe(true)
    expect(controls['createEpic']).toBe(true)
  })

  // `epic:bind` is admin-only whatever the seat's role, an epic's binding being the ceiling on everything a
  // seat reaches in Microtask (design §7.3).
  it('hands no seat the binding controls, those being admin-only at every role', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const controls = (await propsOf(MANAGE_SEAT_TOKEN))['controls'] as Record<string, boolean>
    expect(controls['bindEpic']).toBe(false)
    expect(controls['unbindEpic']).toBe(false)
  })

  it('hands over the seat’s own writes, every one of them bound rather than a module function', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const actions = (await propsOf(MANAGE_SEAT_TOKEN))['actions'] as Record<string, { name: string }>
    expect(Object.keys(actions).length).toBeGreaterThan(0)
    for (const member of Object.values(actions)) expect(member.name.startsWith('bound ')).toBe(true)
  })
})

describe('a read this page cannot make renders nothing at all', () => {
  // The layout met the same refusal from the same cached reads and says it once, in place of the timeline.
  // A sentence here would be a duplicate of it.
  it('leaves for the unavailable page when the bootstrap names no seat at all', async () => {
    await expect(open(SEAT_TOKEN)).rejects.toThrow(Redirected)
  })

  // A plan the API refuses after the bootstrap succeeded is the case that renders nothing: the layout has
  // already said the refusal once, in place of the timeline, so a sentence here would be a duplicate.
  it('renders nothing when the plan itself was refused', async () => {
    seated(MANAGE_SEAT_TOKEN)
    api.plans = []
    await expect(open(MANAGE_SEAT_TOKEN)).rejects.toThrow()
  })
})
