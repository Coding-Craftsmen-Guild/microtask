import {
  createMacroplanAdminClient,
  createMacroplanLinkClient,
  planItemPath,
  type ClientOptions,
} from '@repo/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { problemAnswer } from '../components/plan/testing/fake-plan-api'
import {
  ADMIN_TOKEN,
  EPIC_1,
  FEATURE_1,
  FEATURE_2,
  ITEM_1,
  MANAGE_SEAT_TOKEN,
  PLAN_A,
  REVOKED_SEAT_TOKEN,
  WRITE_SEAT_TOKEN,
  atlasPlan,
} from '../components/plan/testing/plan-fixture'
import { ACTION_REFUSALS, plainRefusal } from '../lib/refusal'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'
import { Redirected, redirectOf } from './testing/redirected'

// One request, as the wire carried it — the shape `testing/recording-admin.ts` records, restated
// here because this file needs one recorder serving **two** clients at once: the admin's and the
// seat's. That is the whole subject of the sweep below, and `recordingAdmin` mints one client per
// call and answers 401 to every bearer but the admin's, so it cannot be that recorder.
interface Sent {
  readonly method: string
  readonly path: string
  readonly bearer: string | undefined
  readonly body: unknown
}

type Wire = Omit<Sent, 'bearer'>

const sent: Sent[] = []
const refusals: { matches: (one: Sent) => boolean; status: number }[] = []
const refresh = vi.fn()

// Keyed on the bearer, as every fake in this app is: a request presenting anything else is answered
// 401 rather than leniently, so a seat action wired to the admin client — or handed the wrong
// token — fails here instead of being handed the plan. `REVOKED_SEAT_TOKEN` is deliberately absent.
const KNOWN = [ADMIN_TOKEN, WRITE_SEAT_TOKEN, MANAGE_SEAT_TOKEN]

const planAnswer = (): Response =>
  new Response(JSON.stringify(atlasPlan()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const fetcher = (url: string, init: RequestInit): Promise<Response> => {
  const one: Sent = {
    method: init.method ?? 'GET',
    path: new URL(url).pathname,
    bearer: new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '') ?? undefined,
    body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
  }
  sent.push(one)
  if (one.bearer === undefined || !KNOWN.includes(one.bearer)) {
    return Promise.resolve(problemAnswer(401))
  }
  const refused = refusals.find((each) => each.matches(one))
  return Promise.resolve(refused === undefined ? planAnswer() : problemAnswer(refused.status))
}

const options = (): ClientOptions => ({
  baseUrl: 'http://api.test',
  serviceKey: 'test-key',
  fetch: fetcher,
})

// Both halves of `lib/api` over the one recorder, because this file runs the admin action and the
// seat action for each of the twenty-three writes and compares what went out.
vi.mock('../lib/api', () => ({
  apiForSession: () => Promise.resolve(createMacroplanAdminClient(options(), ADMIN_TOKEN)),
  apiForLink: (token: string) => createMacroplanLinkClient(options(), token),
}))
vi.mock('next/cache', () => ({ refresh: () => refresh() }))
vi.mock('next/navigation', () => ({
  redirect: (location: string) => {
    throw new Redirected(location)
  },
}))

const {
  seatCreateEpic,
  seatCreateFeature,
  seatCreateItem,
  seatDescribeItem,
  seatEstimateFeature,
  seatEstimateItem,
  seatPinFeature,
  seatPlaceFeature,
  seatPlaceItem,
  seatRecolourEpic,
  seatRemoveEpic,
  seatRemoveFeature,
  seatRemoveItem,
  seatRenameEpic,
  seatRenameFeature,
  seatRenameItem,
  seatReorderEpic,
  seatSetDependencies,
} = await import('./seat-writes')

const { createEpic, recolourEpic, removeEpic, renameEpic, reorderEpic } = await import('./epics')

const { bindEpic, createTask, linkItem, unbindEpic, unlinkItem } = await import('./bridge')

const { seatBindEpic, seatCreateTask, seatLinkItem, seatUnbindEpic, seatUnlinkItem } = await import(
  './seat-bridge',
)
const { createFeature, estimateFeature, pinFeature, placeFeature, removeFeature, renameFeature, setDependencies } =
  await import('./features')
const { createItem, describeItem, estimateItem, placeItem, removeItem, renameItem } =
  await import('./items')

const NAME = 'Auth rewrite II'
const COLOUR = '#ef4444'
const DESCRIPTION = 'Rotate the signing keys first.'
const SEAT = WRITE_SEAT_TOKEN

interface Mirror {
  readonly name: string
  readonly admin: () => Promise<unknown>
  readonly seat: (token: string) => Promise<unknown>
}

// The twenty-three, each as the admin sends it and as a seat sends it from the same arguments. A row
// that named two different writes would fail the comparison rather than pass it quietly.
// The pasted token and the task id the five bridge rows send. The token is a literal rather than a
// fixture constant because that is what it is on this path — a string an admin typed, not an identifier
// this app knows anything about.
const BINDING = { token: 'shr_pasted_from_microtask', role: 'manage' } as const

const TASK_1 = '01M240ERCRWWCN16Q5AHP1FZT1'

const MIRRORS: readonly Mirror[] = [
  {
    name: 'createEpic',
    admin: () => createEpic(PLAN_A, { name: 'Billing' }),
    seat: (token) => seatCreateEpic(token, PLAN_A, { name: 'Billing' }),
  },
  {
    name: 'renameEpic',
    admin: () => renameEpic(PLAN_A, EPIC_1, NAME),
    seat: (token) => seatRenameEpic(token, PLAN_A, EPIC_1, NAME),
  },
  {
    name: 'recolourEpic',
    admin: () => recolourEpic(PLAN_A, EPIC_1, COLOUR),
    seat: (token) => seatRecolourEpic(token, PLAN_A, EPIC_1, COLOUR),
  },
  {
    name: 'reorderEpic',
    admin: () => reorderEpic(PLAN_A, EPIC_1, 2),
    seat: (token) => seatReorderEpic(token, PLAN_A, EPIC_1, 2),
  },
  {
    name: 'removeEpic',
    admin: () => removeEpic(PLAN_A, EPIC_1),
    seat: (token) => seatRemoveEpic(token, PLAN_A, EPIC_1),
  },
  {
    name: 'createFeature',
    admin: () => createFeature(PLAN_A, { epicId: EPIC_1, name: 'Audit log' }),
    seat: (token) => seatCreateFeature(token, PLAN_A, { epicId: EPIC_1, name: 'Audit log' }),
  },
  {
    name: 'renameFeature',
    admin: () => renameFeature(PLAN_A, FEATURE_1, NAME),
    seat: (token) => seatRenameFeature(token, PLAN_A, FEATURE_1, NAME),
  },
  {
    name: 'estimateFeature',
    admin: () => estimateFeature(PLAN_A, FEATURE_1, 8),
    seat: (token) => seatEstimateFeature(token, PLAN_A, FEATURE_1, 8),
  },
  {
    name: 'pinFeature',
    admin: () => pinFeature(PLAN_A, FEATURE_1, 3),
    seat: (token) => seatPinFeature(token, PLAN_A, FEATURE_1, 3),
  },
  {
    name: 'placeFeature',
    admin: () => placeFeature(PLAN_A, FEATURE_1, { epicId: EPIC_1, position: 1 }),
    seat: (token) => seatPlaceFeature(token, PLAN_A, FEATURE_1, { epicId: EPIC_1, position: 1 }),
  },
  {
    name: 'setDependencies',
    admin: () => setDependencies(PLAN_A, FEATURE_1, [FEATURE_2]),
    seat: (token) => seatSetDependencies(token, PLAN_A, FEATURE_1, [FEATURE_2]),
  },
  {
    name: 'removeFeature',
    admin: () => removeFeature(PLAN_A, FEATURE_1),
    seat: (token) => seatRemoveFeature(token, PLAN_A, FEATURE_1),
  },
  {
    name: 'createItem',
    admin: () => createItem(PLAN_A, { featureId: FEATURE_1, name: 'Device list' }),
    seat: (token) => seatCreateItem(token, PLAN_A, { featureId: FEATURE_1, name: 'Device list' }),
  },
  {
    name: 'renameItem',
    admin: () => renameItem(PLAN_A, ITEM_1, NAME),
    seat: (token) => seatRenameItem(token, PLAN_A, ITEM_1, NAME),
  },
  {
    name: 'estimateItem',
    admin: () => estimateItem(PLAN_A, ITEM_1, 4),
    seat: (token) => seatEstimateItem(token, PLAN_A, ITEM_1, 4),
  },
  {
    name: 'describeItem',
    admin: () => describeItem(PLAN_A, ITEM_1, DESCRIPTION),
    seat: (token) => seatDescribeItem(token, PLAN_A, ITEM_1, DESCRIPTION),
  },
  {
    name: 'placeItem',
    admin: () => placeItem(PLAN_A, ITEM_1, { featureId: FEATURE_1, position: 0 }),
    seat: (token) => seatPlaceItem(token, PLAN_A, ITEM_1, { featureId: FEATURE_1, position: 0 }),
  },
  {
    name: 'removeItem',
    admin: () => removeItem(PLAN_A, ITEM_1),
    seat: (token) => seatRemoveItem(token, PLAN_A, ITEM_1),
  },
  {
    name: 'bindEpic',
    admin: () => bindEpic(PLAN_A, EPIC_1, BINDING),
    seat: (token) => seatBindEpic(token, PLAN_A, EPIC_1, BINDING),
  },
  {
    name: 'unbindEpic',
    admin: () => unbindEpic(PLAN_A, EPIC_1),
    seat: (token) => seatUnbindEpic(token, PLAN_A, EPIC_1),
  },
  {
    name: 'linkItem',
    admin: () => linkItem(PLAN_A, ITEM_1, TASK_1),
    seat: (token) => seatLinkItem(token, PLAN_A, ITEM_1, TASK_1),
  },
  {
    name: 'unlinkItem',
    admin: () => unlinkItem(PLAN_A, ITEM_1),
    seat: (token) => seatUnlinkItem(token, PLAN_A, ITEM_1),
  },
  {
    name: 'createTask',
    admin: () => createTask(PLAN_A, ITEM_1),
    seat: (token) => seatCreateTask(token, PLAN_A, ITEM_1),
  },
]

const wireOf = (requests: readonly Sent[]): readonly Wire[] =>
  requests.map(({ method, path, body }) => ({ method, path, body }))

const bearers = (): readonly (string | undefined)[] => sent.map((one) => one.bearer)

const sorted = (names: readonly string[]): readonly string[] => [...names].sort()

const seatNameOf = (member: string): string =>
  `seat${member.slice(0, 1).toUpperCase()}${member.slice(1)}`

beforeEach(() => {
  sent.length = 0
  refusals.length = 0
  refresh.mockReset()
})

describe('the same twenty-three writes, sent from a seat', () => {
  it.each(MIRRORS)(
    'sends $name to the very route, method and body the admin action sends it to',
    async (mirror) => {
      await mirror.admin()
      const asAdmin = wireOf(sent)
      sent.length = 0

      await mirror.seat(SEAT)

      expect(wireOf(sent)).toEqual(asAdmin)
      expect(asAdmin).toHaveLength(1)
    },
  )

  it.each(MIRRORS)('presents the seat token as the whole credential of $name', async (mirror) => {
    await mirror.seat(SEAT)
    expect(bearers()).toEqual([SEAT])
  })

  // The table above already proves, per action, that whatever token an action is called with becomes
  // the bearer. What it cannot show is that the value is a genuine parameter rather than a constant
  // that happens to equal SEAT everywhere it is asserted — so this checks two representative actions,
  // one from each end of the twenty-three, against a second token instead of repeating the same plumbing
  // twenty-three times over.
  it.each(MIRRORS.filter((_, i) => i === 0 || i === MIRRORS.length - 1))(
    'presents whichever token it was handed for $name, never a fixed one',
    async (mirror) => {
      await mirror.seat(MANAGE_SEAT_TOKEN)
      expect(bearers()).toEqual([MANAGE_SEAT_TOKEN])
    },
  )

  it('mirrors all twenty-three, so the sweeps above are neither empty nor short of one', async () => {
    // Eighteen plus five, and both numbers asserted: the split is where a write could go missing
    // without either module noticing on its own.
    expect(MIRRORS).toHaveLength(23)
    expect(Object.keys(await import('./seat-writes'))).toHaveLength(18)
    expect(Object.keys(await import('./seat-bridge'))).toHaveLength(5)
  })

  // Both modules together, because phase 4 split the five bridge writes out of `seat-writes.ts` when it
  // reached ADR 0027's line cap. The union is what has to match the mirrors — a write that went missing
  // from one module and was never added to the other would fail here rather than quietly stop existing.
  it('exposes every one of them across both modules, and narrows to no role', async () => {
    const both = { ...(await import('./seat-writes')), ...(await import('./seat-bridge')) }
    expect(sorted(Object.keys(both))).toEqual(sorted(MIRRORS.map((one) => seatNameOf(one.name))))
  })
})

describe('what a seat does with the plan the write answers', () => {
  it('answers the recomputed plan, which is what the surface renders', async () => {
    expect(await seatRenameFeature(SEAT, PLAN_A, FEATURE_1, NAME)).toEqual({
      ok: true,
      value: atlasPlan(),
    })
  })

  it('re-renders the seat page once a write lands, exactly as the admin page is re-rendered', async () => {
    await seatRenameFeature(SEAT, PLAN_A, FEATURE_1, NAME)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone when the write was refused, so the sentence survives the answer', async () => {
    refusals.push({ matches: () => true, status: 403 })
    expect(await seatRenameFeature(SEAT, PLAN_A, FEATURE_1, NAME)).toEqual({
      ok: false,
      status: 403,
      detail: plainRefusal(403, ACTION_REFUSALS.link),
    })
    expect(refresh).not.toHaveBeenCalled()
  })

  it("says what a refused seat is told, in this surface's words and never the API's own", async () => {
    refusals.push({ matches: () => true, status: 403 })
    const answer = await seatPinFeature(SEAT, PLAN_A, FEATURE_1, 3)
    expect(answer).toMatchObject({
      detail: 'This link does not allow that. Its access may have changed, so reload the page to see what it can do now.',
    })
  })
})

describe('a seat refusal never becomes a password form', () => {
  it.each(MIRRORS)('sends a revoked seat calling $name to the terminal page', async (mirror) => {
    expect(await redirectOf(mirror.seat(REVOKED_SEAT_TOKEN))).toBe(LINK_UNAVAILABLE_PATH)
  })

  it('never names /login, and never carries the token into a next= of its own', async () => {
    const location = await redirectOf(seatRemoveItem(REVOKED_SEAT_TOKEN, PLAN_A, ITEM_1))
    expect(location).toBe(LINK_UNAVAILABLE_PATH)
    expect(location).not.toContain('next=')
    expect(location).not.toContain(REVOKED_SEAT_TOKEN)
  })

  it('does not re-render the page it never changed', async () => {
    await redirectOf(seatRemoveItem(REVOKED_SEAT_TOKEN, PLAN_A, ITEM_1))
    expect(refresh).not.toHaveBeenCalled()
  })

  it("reaches the plan route under the revoked token, so the 401 is the API's answer and not a guess", async () => {
    await redirectOf(seatRemoveItem(REVOKED_SEAT_TOKEN, PLAN_A, ITEM_1))
    expect(wireOf(sent)).toEqual([
      { method: 'DELETE', path: planItemPath(PLAN_A, ITEM_1), body: undefined },
    ])
    expect(bearers()).toEqual([REVOKED_SEAT_TOKEN])
  })
})
