import { render, screen } from '@testing-library/react'
import { isValidElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bridgeReadKey,
  fakePlanApiState,
  fakePlanFetch,
  holdingSeat,
  itemReadKey,
  trace,
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

const NO_SUCH_ITEM = '01MPHHHHHHHHHHHHHHHHHHHHH9'

class NotFound extends Error {}

class Redirected extends Error {
  constructor(readonly location: string) {
    super(`redirect ${location}`)
  }
}

vi.mock('next/headers', () => ({
  cookies: () => {
    throw new Error('a seat drawer must not read a cookie')
  },
  headers: () => {
    throw new Error('a seat drawer must not read a header')
  },
}))

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

const { default: SeatItemDrawerPage } = await import('./page')

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

const open = async (token: string, itemId = ITEM_1) =>
  SeatItemDrawerPage({ params: Promise.resolve({ token, itemId }) })

const propsOf = async (token: string, itemId = ITEM_1): Promise<Record<string, unknown>> => {
  const element = await open(token, itemId)
  return isValidElement<Record<string, unknown>>(element) ? element.props : {}
}

describe('a seat opens one item beside the plan its token opens', () => {
  it('draws the panel for an item the plan holds', async () => {
    seated(MANAGE_SEAT_TOKEN)
    render(await open(MANAGE_SEAT_TOKEN))
    expect(screen.getByText('Sessions')).toBeTruthy()
  })

  it('closes back to this seat’s own page, never to an admin path', async () => {
    seated(MANAGE_SEAT_TOKEN)
    expect((await propsOf(MANAGE_SEAT_TOKEN))['closeHref']).toBe(linkPath(MANAGE_SEAT_TOKEN))
  })

  it('is notFound for an item the plan does not hold', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await expect(open(MANAGE_SEAT_TOKEN, NO_SUCH_ITEM)).rejects.toThrow(NotFound)
  })

  it('is notFound for a feature id in the item segment', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await expect(open(MANAGE_SEAT_TOKEN, FEATURE_1)).rejects.toThrow(NotFound)
  })

  // The description lives in the item's own file, so it is a second read — and the only reason this segment
  // makes one where the feature segment does not.
  it('reads the item’s own file for its description, under the URL token', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await open(MANAGE_SEAT_TOKEN)
    expect(trace(api)).toContain(`${itemReadKey(PLAN_A, ITEM_1)} ${MANAGE_SEAT_TOKEN}`)
  })

  it('reads the bridge as well, which is what a link field needs to say anything', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await open(MANAGE_SEAT_TOKEN)
    expect(trace(api)).toContain(`${bridgeReadKey(PLAN_A)} ${MANAGE_SEAT_TOKEN}`)
  })
})

describe('the task picker a seat is deliberately not given', () => {
  // Design §7.3 grants an effective `write` holder "the linked task's name", meaning the one task linked. The
  // route listing every task in a bound project is gated on `epic:bind` — admin-only, an epic's binding being
  // the ceiling on everything a seat reaches in Microtask — so a list of up to five hundred names is
  // materially more than the grant and a seat is answered none.
  it('reads no task list at all, that route being admin-only', async () => {
    seated(MANAGE_SEAT_TOKEN)
    await open(MANAGE_SEAT_TOKEN)
    expect(trace(api).some((one) => one.includes('/tasks'))).toBe(false)
  })

  it('hands the field no options, so it draws no picker', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const link = (await propsOf(MANAGE_SEAT_TOKEN))['link']
    const props = isValidElement<Record<string, unknown>>(link) ? link.props : {}
    expect(props['options']).toBe('')
  })

  // What a seat does get is the rest of the field, which is the asymmetry the grant describes: it can unlink
  // and create, and cannot browse.
  it('still hands over unlink and create, which need no list to work', async () => {
    seated(MANAGE_SEAT_TOKEN)
    const link = (await propsOf(MANAGE_SEAT_TOKEN))['link']
    const props = isValidElement<Record<string, unknown>>(link) ? link.props : {}
    expect(typeof props['unlink']).toBe('function')
    expect(typeof props['createTask']).toBe('function')
  })

  // `item:link` is a `write` grant, so a view seat is refused the field before the bridge is consulted.
  it('draws no link field at all for a view seat', async () => {
    seated(SEAT_TOKEN)
    expect((await propsOf(SEAT_TOKEN))['link']).toBeNull()
  })
})
