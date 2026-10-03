import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  currentShareKey,
  fakePlanApiState,
  fakePlanFetch,
  holdingSeat,
  problemAnswer,
  trace,
  type FakePlanApiState,
} from '../../../components/plan/testing/fake-plan-api'
import { atlasPlan, PLAN_A, SEAT_TOKEN } from '../../../components/plan/testing/plan-fixture'
import SeatFeatureDrawerPage from './f/[featureId]/page'
import SeatItemDrawerPage from './i/[itemId]/page'

// next/headers is mocked to throw, which is the assertion: a `/s/*` route authenticates from its own URL,
// so a cookie or a header read anywhere under it fails this file rather than passing quietly (ADR 0040).
vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a seat page must not read a cookie')
  },
  headers: () => {
    throw new Error('a seat page must not read a header')
  },
}))

let api: FakePlanApiState = fakePlanApiState()

beforeEach(() => {
  vi.stubEnv('API_BASE_URL', 'http://api.internal:4321')
  vi.stubEnv('API_KEY', 'the-macroplan-service-key')
  vi.stubEnv('COOKIE_SECRET', 'a-cookie-secret-of-at-least-32-by')
  api = fakePlanApiState()
  api.plans = [atlasPlan()]
  vi.stubGlobal('fetch', fakePlanFetch(api))
})

const { default: LinkPlanPage, generateMetadata } = await import('./page')

const props = (token: string) => ({ params: Promise.resolve({ token }) })

const seated = (token: string): void => {
  const stored = atlasPlan().shareLinks.find((seat) => seat.token === token)
  if (stored === undefined) throw new Error(`the fixture holds no seat ${token}`)
  holdingSeat(api, PLAN_A, stored.role, token)
}

/**
 * `/s/<token>`: what is left of the page once the plan moved up to the layout.
 *
 * The screen — the plan, its timeline, its table and its tree — is `./seat-plan.tsx`, called by
 * `layout.tsx`, and `seat-plan.test.tsx` is where every question about it lives. This file is about what
 * stayed: nothing to draw, and the tab title.
 */
describe('the seat page is the drawer slot with nothing open', () => {
  // It used to render a paragraph explaining that a feature and an item each have their own address and
  // that whatever is on screen can be linked to, reloaded and stepped back out of. That is a note about
  // how the routing was built, and it was under the plan for every holder of every link. The admin
  // surface's own page has always returned null here; this is the twin of it.
  it('draws nothing at all, a reader who has opened nothing needing to be told nothing', () => {
    const { container } = render(LinkPlanPage())
    expect(container.innerHTML).toBe('')
  })

  it('reads nothing to draw nothing, the plan being the layout’s own read', () => {
    render(LinkPlanPage())
    expect(trace(api)).toEqual([])
  })

  // It takes no params at all, which is what keeps the surface's reads in the layout that draws the plan.
  it('takes no argument, so nothing about it can depend on which plan is open', () => {
    expect(LinkPlanPage.length).toBe(0)
  })
})

describe('the tab title comes from the bootstrap and never from a plan read', () => {
  it('titles the tab with the plan’s name, reading no plan to do it', async () => {
    seated(SEAT_TOKEN)
    expect(await generateMetadata(props(SEAT_TOKEN))).toEqual({
      title: 'Atlas rollout · CC Guild Macroplan',
    })
    expect(trace(api)).toEqual([`${currentShareKey()} ${SEAT_TOKEN}`])
  })

  it('names no plan when the bootstrap was refused, rather than inventing one', async () => {
    api.answers.set(currentShareKey(), () => problemAnswer(403, 'Not permitted: plan:read'))
    expect(await generateMetadata(props(SEAT_TOKEN))).toEqual({
      title: 'Shared plan · CC Guild Macroplan',
    })
  })
})

// A seat's two drawer routes, which the browser draws as the admin's are (ADR 0069): the address exists,
// and the route reads nothing — so a drawer opened on a seat presents the token to the API no more often
// than the plan itself did.
describe('a seat’s drawer routes, which the browser draws', () => {
  it.each([
    ['a feature', SeatFeatureDrawerPage],
    ['an item', SeatItemDrawerPage],
  ])('renders nothing for %s and takes no params, so it can read nothing', (_what, Page) => {
    expect(Page).toHaveLength(0)
    expect(Page()).toBeNull()
  })
})
