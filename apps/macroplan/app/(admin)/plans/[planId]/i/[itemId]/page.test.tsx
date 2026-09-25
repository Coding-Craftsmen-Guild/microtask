import { seal } from '@repo/app-session/crypto'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakePlanApiState,
  fakePlanFetch,
  holdingAdmin,
  itemReadKey,
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
  FEATURE_1,
  ITEM_1,
  ITEM_3,
  PLAN_A,
  PLAN_GONE,
  unplacedPlan,
} from '../../../../../../components/plan/testing/plan-fixture'
import { payloadOf } from '../../../../../../lib/principal'
import { planPath } from '../../../../../../lib/routes'

const SECRET = 'a-cookie-secret-of-at-least-32-by'

const NO_SUCH_ITEM = '01MPHHHHHHHHHHHHHHHHHHHHH9'

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

const { default: ItemDrawerPage } = await import('./page')

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

const propsOf = (itemId: string, planId = PLAN_A) => ({
  params: Promise.resolve({ planId, itemId }),
})

const show = async (itemId = ITEM_1, planId = PLAN_A) =>
  render(await ItemDrawerPage(propsOf(itemId, planId)))

const thrownBy = async (itemId: string, planId = PLAN_A): Promise<unknown> => {
  try {
    await ItemDrawerPage(propsOf(itemId, planId))
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

describe('the drawer one item is open in', () => {
  it('names the item the URL names, and not the feature it flows under', async () => {
    await show()
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Auth rewrite' })).toBeNull()
  })

  it('says which feature it flows under, which is the context a bare item name lacks', async () => {
    await show()
    expect(valueOf('Feature')).toBe('Auth rewrite')
    expect(valueOf('Epic')).toBe('Platform')
  })

  it('says the same words the table row says about it, rather than wording them again', async () => {
    await show()
    expect(valueOf('Estimate')).toBe('3d')
    expect(valueOf('Sprint')).toBe('S1')
  })

  // `3d` and `S1` are both wordings a panel formatting the record itself would land on, so the case
  // above passes either way. This one does not: an unplaced item's sprint cell is a sentence `rows.ts`
  // picks by treatment, and nothing outside that file knows which of the three to say.
  it('says why an item has no sprint at all, in the sentence the row picked for its treatment', async () => {
    api.plans = [unplacedPlan('in-cycle')]
    await show(ITEM_3)
    expect(screen.getByRole('heading', { level: 2, name: 'Invoices' })).toBeTruthy()
    expect(valueOf('Sprint')).toBe('not placed · in a dependency cycle')
  })

  it('opens another feature’s item at its own address', async () => {
    await show(ITEM_3)
    expect(screen.getByRole('heading', { level: 2, name: 'Invoices' })).toBeTruthy()
    expect(valueOf('Feature')).toBe('Billing')
  })

  it('closes back to the plan’s own URL, which is the same address with nothing selected', async () => {
    await show()
    expect(screen.getByRole('link', { name: 'Close' }).getAttribute('href')).toBe(planPath(PLAN_A))
  })

  // Two reads, and the second one is the description: a plan carries none, so the only way to seed the
  // field is the item's own file. Both go out under the bearer the cookie carries and nothing else does.
  it('reads the plan and then the item’s own file, both under the admin cookie’s bearer', async () => {
    await show()
    expect(trace(api)).toEqual([
      `${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`,
      `${itemReadKey(PLAN_A, ITEM_1)} ${ADMIN_TOKEN}`,
    ])
  })

  it('does not read a description for an item the plan does not place, a stale link costing one call', async () => {
    await thrownBy(NO_SUCH_ITEM)
    expect(trace(api)).toEqual([`${planReadKey(PLAN_A)} ${ADMIN_TOKEN}`])
  })
})

describe('the description, which is the one thing the plan read does not carry', () => {
  it('draws the box with the text the item’s own file holds', async () => {
    api.descriptions.set(ITEM_1, 'Ship behind a flag')
    await show()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' }).value).toBe(
      'Ship behind a flag',
    )
  })

  it('draws an empty box for an item nobody has described, which the API answers as empty text', async () => {
    await show()
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: 'Description' }).value).toBe('')
    expect(screen.getByText('8192 of 8192 bytes left')).toBeTruthy()
  })

  it('draws no box at all when the item file was refused, rather than one over text nobody saw', async () => {
    api.answers.set(itemReadKey(PLAN_A, ITEM_1), () => problemAnswer(403, 'Not permitted'))
    await show()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
  })

  // A 404 on the item file is answered the same way and deliberately: the plan read already placed this
  // item, so this is a file the API would not answer for and not a missing item. `adminCall` is what
  // keeps it a value here, where `readPlan`'s `adminRead` would have made it a not-found page.
  it('keeps the panel on screen when the item file is answered 404, the row having been found', async () => {
    api.answers.set(itemReadKey(PLAN_A, ITEM_1), () => problemAnswer(404, 'No such item'))
    await show()
    expect(screen.queryByRole('textbox', { name: 'Description' })).toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Sessions' })).toBeTruthy()
  })

  it('draws the name and estimate fields from the record, an item’s own actions behind them', async () => {
    await show()
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Item name' }).value).toBe(
      'Sessions',
    )
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Estimate in days' }).value).toBe(
      '3',
    )
  })
})

describe('an id that names nothing the plan can place', () => {
  it('renders not-found for an item this plan does not hold, not an empty drawer', async () => {
    expect(await thrownBy(NO_SUCH_ITEM)).toBeInstanceOf(NotFound)
  })

  it('renders not-found for an id that names a feature, the two segments not answering for each other', async () => {
    expect(await thrownBy(FEATURE_1)).toBeInstanceOf(NotFound)
  })

  it('renders not-found for a plan the workspace does not hold, as the layout does', async () => {
    expect(await thrownBy(ITEM_1, PLAN_GONE)).toBeInstanceOf(NotFound)
  })

  // The one place the drawer's answer is narrower than "the plan holds this id", and it is the
  // consequence of resolving a subject through the derived order rather than through `plan.items`:
  // `itemsByFeature` groups an item under a `featureId` the plan does not hold and it is then "simply
  // never asked for" (`@repo/schedule`), so the canvas draws nothing for it and `tableRows` gives it
  // no row. There is no rail, no feature and no sprint to draw such an item against, and deleting a
  // feature takes its items with it on the server — `withoutFeatures` in
  // `packages/macroplan-domain/src/services/cascade.ts` — so no plan the API served holds one.
  it('renders not-found for an item whose feature the plan no longer holds, having nothing to place it in', async () => {
    api.plans = [atlasPlan({ features: [] })]
    expect(atlasPlan().items.some((one) => one.id === ITEM_1)).toBe(true)
    expect(await thrownBy(ITEM_1)).toBeInstanceOf(NotFound)
  })

  it('draws nothing at all when the read was refused, the layout having said that once already', async () => {
    api.answers.set(planReadKey(PLAN_A), () => problemAnswer(403, 'Not permitted: plan:read'))
    const element = await ItemDrawerPage(propsOf(ITEM_1))
    expect(element).toBeNull()
    render(element)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('sends an expired admin back to the plan, one cached read knowing that path and not this one', async () => {
    bearer = null
    const thrown = await thrownBy(ITEM_1)
    expect(thrown instanceof Redirected ? thrown.location : '').toBe(
      `/login?next=%2Fplans%2F${PLAN_A}`,
    )
    expect(trace(api)).toEqual([])
  })
})

describe('the item drawer hands no share token to a component either', () => {
  it('was answered all three on the wire, so what follows is a reduction and not a thin plan', async () => {
    await ItemDrawerPage(propsOf(ITEM_1))
    const wire = JSON.stringify(answered)
    for (const token of EVERY_TOKEN) expect(wire).toContain(token)
  })

  it('hands not one of them to a component, and renders none of them', async () => {
    const element = await ItemDrawerPage(propsOf(ITEM_1))
    const { container } = render(element)
    const handed = handedBy(element)
    expect(handed.strings.filter((one) => EVERY_TOKEN.some((token) => one.includes(token)))).toEqual(
      [],
    )
    for (const token of EVERY_TOKEN) expect(container.innerHTML).not.toContain(token)
  })

  it('hands over the eighteen writes and nothing bound, as the feature drawer does', async () => {
    const handed = handedBy(await ItemDrawerPage(propsOf(ITEM_1)))
    expect([...handed.functions].sort()).toEqual(Object.keys(ADMIN_PLAN_ACTIONS).sort())
    expect(handed.functions.filter((name) => name.startsWith('bound '))).toEqual([])
    expect(handed.functions.filter((name) => name === '')).toEqual([])
  })
})
