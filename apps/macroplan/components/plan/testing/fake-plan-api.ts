import { MACROPLAN_CURRENT_SHARE_PATH, MACROPLAN_PLANS_PATH } from '@repo/api-client'
import type { RoleValue } from '@repo/contracts'
import type { ListedPlan } from '../../plans/plan-row'
import { ADMIN_TOKEN, SEAT_TOKEN, type StoredPlan } from './plan-fixture'

/** One request the fake API received, as the wire carried it. */
export interface Received {
  /** The HTTP method, as the transport upper-cased it. */
  readonly method: string

  /** The path below the base URL, with no query string. */
  readonly path: string

  /** The bearer this request presented, or `undefined` when it presented none. */
  readonly bearer: string | undefined

  /** The parsed request body, or `undefined` when there was none. */
  readonly body: unknown
}

/**
 * Whoever a bearer names: this app's two principals, and no third.
 *
 * A seat carries the plan it is rooted in and the role it holds, because those are the two facts
 * every answer to it is decided from — the API reads them from the manifest on every request, and a
 * fake that stored only "is a seat" could not refuse a call outside that plan (ADR 0053).
 */
export type FakePrincipal =
  | { readonly kind: 'admin' }
  | { readonly kind: 'link'; readonly planId: string; readonly role: RoleValue }

/** What the fake API holds, all of it live and all of it keyed by what the wire would name. */
export interface FakePlanApiState {
  /** Bearer → the principal it names. A bearer not here is answered 401, as a revoked one is. */
  readonly principals: Map<string, FakePrincipal>

  /** Every plan the workspace holds, in the order `plans.list()` answers with. */
  plans: readonly StoredPlan[]

  /** Item id → the description its own file holds. An item not here has an empty one. */
  readonly descriptions: Map<string, string>

  /** Every request, in order. */
  readonly received: Received[]

  /** Overrides by `METHOD path`, answered before anything else. */
  readonly answers: Map<string, () => Response>
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': status >= 400 ? 'application/problem+json' : 'application/json',
    },
  })

/**
 * A problem document in the API's own shape, for an `answers` override.
 *
 * It goes through `ApiError` unchanged, so a test that overrides one route with this drives the
 * real remedy path rather than a shape only this file understands.
 */
export const problemAnswer = (status: number, detail = `status ${String(status)}`): Response =>
  json(status, {
    type: '/problems/x',
    title: 't',
    status,
    code: status === 401 ? 'unknown_principal' : 'x',
    detail,
    instance: '/v1/x',
  })

const told = (who: FakePrincipal): boolean => who.kind === 'admin'

const listRowOf = (plan: StoredPlan, who: FakePrincipal): ListedPlan => ({
  id: plan.id,
  name: plan.name,
  startDate: plan.startDate,
  sprintLengthDays: plan.sprintLengthDays,
  timezone: plan.timezone,
  epicCount: plan.epics.length,
  featureCount: plan.features.length,
  itemCount: plan.items.length,
  ...(told(who) ? { shareLinkCount: plan.shareLinks.length } : {}),
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
})

const planViewOf = (plan: StoredPlan, who: FakePrincipal): unknown => {
  const { shareLinks, ...rest } = plan
  return told(who) ? { ...rest, shareLinks } : rest
}

const reaches = (who: FakePrincipal, planId: string): boolean =>
  who.kind === 'admin' || who.planId === planId

const planOf = (state: FakePlanApiState, planId: string): StoredPlan | undefined =>
  state.plans.find((one) => one.id === planId)

const listAnswer = (state: FakePlanApiState, who: FakePrincipal): Response =>
  told(who)
    ? json(200, { plans: state.plans.map((plan) => listRowOf(plan, who)) })
    : problemAnswer(403, 'Not permitted: workspace:list-plans')

const shareAnswer = (state: FakePlanApiState, who: FakePrincipal): Response => {
  if (who.kind === 'admin') return problemAnswer(404, 'No such share link')
  const plan = planOf(state, who.planId)
  if (plan === undefined) return problemAnswer(404, 'No such share link')
  return json(200, {
    role: who.role,
    scope: { kind: 'plan', planId: plan.id },
    plan: { id: plan.id, name: plan.name },
  })
}

const planAnswer = (state: FakePlanApiState, who: FakePrincipal, planId: string): Response => {
  if (!reaches(who, planId)) return problemAnswer(403, 'Not permitted: plan:read')
  const plan = planOf(state, planId)
  if (plan === undefined) return problemAnswer(404, 'No such plan')
  return json(200, planViewOf(plan, who))
}

const itemAnswer = (state: FakePlanApiState, who: FakePrincipal, ids: readonly string[]): Response => {
  const planId = ids[0] ?? ''
  const itemId = ids[1] ?? ''
  if (!reaches(who, planId)) return problemAnswer(403, 'Not permitted: plan:read')
  const item = planOf(state, planId)?.items.find((one) => one.id === itemId)
  if (item === undefined) return problemAnswer(404, 'No such item')
  return json(200, { ...item, description: state.descriptions.get(itemId) ?? '' })
}

const below = (path: string): readonly string[] =>
  path.startsWith(`${MACROPLAN_PLANS_PATH}/`)
    ? path.slice(MACROPLAN_PLANS_PATH.length + 1).split('/')
    : []

const belowPlans = (
  state: FakePlanApiState,
  who: FakePrincipal,
  parts: readonly string[],
): Response => {
  const planId = parts[0]
  if (planId === undefined) return problemAnswer(404, 'Not found')
  if (parts.length === 1) return planAnswer(state, who, planId)
  if (parts.length === 3 && parts[1] === 'items') {
    return itemAnswer(state, who, [planId, parts[2] ?? ''])
  }
  return problemAnswer(404, 'Not found')
}

const route = (
  state: FakePlanApiState,
  method: string,
  path: string,
  who: FakePrincipal,
): Response => {
  if (method !== 'GET') return problemAnswer(405, 'Not allowed')
  if (path === MACROPLAN_PLANS_PATH) return listAnswer(state, who)
  if (path === MACROPLAN_CURRENT_SHARE_PATH) return shareAnswer(state, who)
  return belowPlans(state, who, below(path))
}

/** A fresh, empty fake: no principal is known, so every bearer is answered 401. */
export const fakePlanApiState = (): FakePlanApiState => ({
  principals: new Map(),
  plans: [],
  descriptions: new Map(),
  received: [],
  answers: new Map(),
})

/** Seeds the admin bearer the sealed `mp_admin` cookie carries, so admin calls are answered. */
export const holdingAdmin = (state: FakePlanApiState, token = ADMIN_TOKEN): void => {
  state.principals.set(token, { kind: 'admin' })
}

/** Seeds one plan seat: the plan it is rooted in, the role it holds, and its token. */
export const holdingSeat = (
  state: FakePlanApiState,
  planId: string,
  role: RoleValue,
  token = SEAT_TOKEN,
): void => {
  state.principals.set(token, { kind: 'link', planId, role })
}

/** Every request as `METHOD path bearer`, which is the one line a test asserts the wire by. */
export const trace = (state: FakePlanApiState): readonly string[] =>
  state.received.map((one) => `${one.method} ${one.path} ${String(one.bearer)}`)

/**
 * A `fetch` answering as `apps/api` would for the routes a plan page calls, keyed on the **bearer**
 * — so a request presenting the wrong credential gets the wrong answer, not a lenient one.
 *
 * It is stubbed at `globalThis.fetch` and never at the client, which is the whole point of it: the
 * real `createMacroplanAdminClient`, the real transport, the real contract schemas and the real
 * `ApiError` all run, so a response this file gets wrong fails the parse rather than the assertion,
 * and `state.received` records the actual bearer per request rather than an intention.
 *
 * The gate mirrors the handlers rather than being lenient in the direction of green: `plans.list()`
 * is `workspace:list-plans` and admin-only, so a seat is refused 403 here and not handed a filtered
 * list (ADR 0009); `shares/current` answers a seat and 404s an admin, which names no seat; and a
 * seat reading another plan is refused before the plan is looked up, so a 403 never leaks whether
 * that plan exists. `shareLinks` and `shareLinkCount` are **withheld** from a seat rather than
 * zeroed, one decision asked once, because an empty array says a plan has no seats and absence says
 * the caller was not told (ADR 0013, ADR 0033).
 */
export const fakePlanFetch =
  (state: FakePlanApiState) =>
  (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? 'GET'
    const path = new URL(url).pathname
    const headers = (init.headers ?? {}) as Record<string, string>
    const bearer = headers['authorization']?.replace(/^Bearer /, '')
    state.received.push({
      method,
      path,
      bearer,
      body: init.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    const override = state.answers.get(`${method} ${path}`)
    if (override !== undefined) return Promise.resolve(override())
    const who = bearer === undefined ? undefined : state.principals.get(bearer)
    return Promise.resolve(who === undefined ? problemAnswer(401) : route(state, method, path, who))
  }
