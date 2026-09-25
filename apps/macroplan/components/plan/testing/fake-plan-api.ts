import {
  MACROPLAN_CURRENT_SHARE_PATH,
  MACROPLAN_PLANS_PATH,
  planItemPath,
  planPath,
} from '@repo/api-client'
import {
  mayReach,
  type CapabilityAction,
  type CapabilityTarget,
  type RoleValue,
  type ScopeValue,
} from '@repo/contracts'
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
 * every authorization decision about it is made from — the API's `PrincipalResolver` puts both on
 * the principal, and `can(principal, …)` reads them there rather than from the manifest. What the
 * *stored* seat holds is a separate question, and `shares/current` is where the two can disagree.
 */
export type FakePrincipal =
  | { readonly kind: 'admin' }
  | { readonly kind: 'link'; readonly planId: string; readonly role: RoleValue }

/** What the fake API holds, all of it live and all of it keyed by what the wire would name. */
export interface FakePlanApiState {
  /** Bearer → the principal it names. A bearer not here is answered 401, as a revoked one is. */
  readonly principals: Map<string, FakePrincipal>

  /** Every plan the workspace holds, in any order: `GET /plans` sorts them as the API does. */
  plans: readonly StoredPlan[]

  /** Item id → the description its own file holds. An item not here has an empty one. */
  readonly descriptions: Map<string, string>

  /** Every request, in order. */
  readonly received: Received[]

  /** Overrides by `METHOD path`, answered before anything else. Build the keys with {@link listKey} and its siblings. */
  readonly answers: Map<string, () => Response>
}

/** The `answers` key for `GET /v1/macroplan/plans`, the collection this app's landing page reads. */
export const listKey = (): string => `GET ${MACROPLAN_PLANS_PATH}`

/** The `answers` key for `GET /v1/macroplan/plans/{planId}`. */
export const planReadKey = (planId: string): string => `GET ${planPath(planId)}`

/**
 * The `answers` key for `GET /v1/macroplan/plans/{planId}/bridge`.
 *
 * Left **unanswered** by default on purpose: `read-bridge.ts` collapses every failure to `null`, so a
 * fixture that has not set this one draws exactly the plan it drew before phase 4 — which is what lets
 * every suite written before the bridge existed go on asserting what it asserted. A suite that wants the
 * progress column or a filled bar sets it.
 */
export const bridgeReadKey = (planId: string): string => `GET ${planPath(planId)}/bridge`

/** The `answers` key for `GET /v1/macroplan/plans/{planId}/items/{itemId}`. */
export const itemReadKey = (planId: string, itemId: string): string =>
  `GET ${planItemPath(planId, itemId)}`

/** The `answers` key for `GET /v1/macroplan/shares/current`. */
export const currentShareKey = (): string => `GET ${MACROPLAN_CURRENT_SHARE_PATH}`

const NO_SEAT = 'This credential does not name a share link'

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

interface Asked {
  readonly method: string
  readonly path: string
  readonly bearer: string
  readonly who: FakePrincipal
}

const scopeOf = (planId: string): ScopeValue => ({ kind: 'plan', planId })

const grants = (who: FakePrincipal, action: CapabilityAction, target: CapabilityTarget): boolean =>
  who.kind === 'admin' || mayReach(who.role, scopeOf(who.planId), action, target)

const listRowOf = (plan: StoredPlan, who: FakePrincipal): ListedPlan => ({
  id: plan.id,
  name: plan.name,
  startDate: plan.startDate,
  sprintLengthDays: plan.sprintLengthDays,
  timezone: plan.timezone,
  epicCount: plan.epics.length,
  featureCount: plan.features.length,
  itemCount: plan.items.length,
  ...(grants(who, 'share:read', 'plan') ? { shareLinkCount: plan.shareLinks.length } : {}),
  createdAt: plan.createdAt,
  updatedAt: plan.updatedAt,
})

const planViewOf = (plan: StoredPlan, who: FakePrincipal): unknown => {
  const { shareLinks, ...rest } = plan
  return grants(who, 'share:read', 'plan') ? { ...rest, shareLinks } : rest
}

const reaches = (who: FakePrincipal, planId: string): boolean =>
  who.kind === 'admin' || who.planId === planId

const planOf = (state: FakePlanApiState, planId: string): StoredPlan | undefined =>
  state.plans.find((one) => one.id === planId)

/**
 * The order `GET /plans` answers in, restated from the domain comparator of the same name.
 *
 * Restated rather than imported because the original lives in `@repo/macroplan-domain`, which this
 * app is lint-forbidden to import at all (ADR 0014, ADR 0027) — so a fake that is to answer in the
 * API's order has no way to reuse it. `packages/macroplan-domain/src/entities/plan-order.ts` is
 * that original, and the tiebreak on descending id is load-bearing there: two plans saved in the
 * same millisecond carry the same `updatedAt`, and sorting on that alone leaves their order to
 * whatever the caller happened to seed.
 */
export const newestUpdateFirst = (a: StoredPlan, b: StoredPlan): number =>
  b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)

const listAnswer = (state: FakePlanApiState, who: FakePrincipal): Response =>
  grants(who, 'workspace:list-plans', 'workspace')
    ? json(200, {
        plans: [...state.plans].sort(newestUpdateFirst).map((plan) => listRowOf(plan, who)),
      })
    : problemAnswer(403, 'Not permitted: workspace:list-plans')

const shareAnswer = (state: FakePlanApiState, asked: Asked): Response => {
  if (asked.who.kind === 'admin') return problemAnswer(404, NO_SEAT)
  const plan = planOf(state, asked.who.planId)
  if (plan === undefined) return problemAnswer(404, NO_SEAT)
  const stored = plan.shareLinks.find((seat) => seat.token === asked.bearer)
  if (stored === undefined) return problemAnswer(404, NO_SEAT)
  return json(200, {
    role: stored.role,
    scope: scopeOf(plan.id),
    plan: { id: plan.id, name: plan.name },
  })
}

const planAnswer = (state: FakePlanApiState, who: FakePrincipal, planId: string): Response => {
  if (!reaches(who, planId)) return problemAnswer(403, 'Not permitted: plan:read')
  const plan = planOf(state, planId)
  if (plan === undefined) return problemAnswer(404, 'No such plan')
  return json(200, planViewOf(plan, who))
}

const itemAnswer = (
  state: FakePlanApiState,
  who: FakePrincipal,
  ids: readonly string[],
): Response => {
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

const route = (state: FakePlanApiState, asked: Asked): Response => {
  if (asked.method !== 'GET') return problemAnswer(405, 'Not allowed')
  if (asked.path === MACROPLAN_PLANS_PATH) return listAnswer(state, asked.who)
  if (asked.path === MACROPLAN_CURRENT_SHARE_PATH) return shareAnswer(state, asked)
  return belowPlans(state, asked.who, below(asked.path))
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

/**
 * Seeds one plan seat as a **resolved principal**: the plan it is rooted in, the role it holds, and
 * its token.
 *
 * The role given here is the one every authorization decision is made from, and it may legitimately
 * differ from the role the plan's manifest stores for that token — that is what a seat re-roled
 * between resolution and read looks like, and `shares/current` is the route that shows it. When no
 * such disagreement is wanted, use {@link holdingStoredSeat}, which cannot produce one.
 */
export const holdingSeat = (
  state: FakePlanApiState,
  planId: string,
  role: RoleValue,
  token = SEAT_TOKEN,
): void => {
  state.principals.set(token, { kind: 'link', planId, role })
}

/**
 * Seeds the seat `token` exactly as `plan`'s manifest stores it, and throws if it holds no such
 * seat.
 *
 * This is the seeder to reach for. It is impossible to desynchronise the principal's role from the
 * stored seat's with it, which is the trap {@link holdingSeat} leaves open: a fake that answered
 * `shares/current` from the principal would hide such a mismatch, and this one does not, so a test
 * that means "a `manage` seat of Atlas" says so once rather than twice.
 */
export const holdingStoredSeat = (
  state: FakePlanApiState,
  plan: StoredPlan,
  token = SEAT_TOKEN,
): void => {
  const stored = plan.shareLinks.find((seat) => seat.token === token)
  if (stored === undefined) throw new Error(`plan ${plan.id} holds no seat ${token}`)
  state.principals.set(token, { kind: 'link', planId: plan.id, role: stored.role })
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
 * `ApiError` all run, and `state.received` records the actual bearer per request rather than an
 * intention. What that does **not** buy is correctness of the answers: every divergence worth
 * fearing here — a block withheld from a caller the API grants it to, a role taken from the wrong
 * place — produces a document the contract schema accepts, so it fails as a wrong answer and never
 * as a parse error. `fake-plan-api.test.ts` is what holds the answers to the API's behaviour; the
 * schemas only catch a shape.
 *
 * Every authorization decision is asked of `mayReach` from `@repo/contracts`, against the same
 * action names and target kinds the handlers pass `can` — so `workspace:list-plans` is refused to
 * every seat because its minimum is `admin` (ADR 0009), and `share:read` is granted to a `manage`
 * seat and refused a `view` or `write` one, which is what `visibleLinks` decides in the API. That
 * is one record shared with the kernel's policy and with this app's own `planCapabilities`, rather
 * than a `kind === 'admin'` shortcut that would answer a `manage` seat wrongly. A refused block is
 * **absent**, never zeroed or emptied: an empty array says a plan has no seats, and absence says the
 * caller was not told (ADR 0013, ADR 0033). What identity alone decides is which plan a seat
 * reaches: a seat asking about another plan is refused before the plan is looked up, so a 403 never
 * says whether that plan exists.
 *
 * `shares/current` looks the seat up in the plan's manifest by the token presented and answers the
 * **stored** role, 404ing when no seat holds that token — the handler's own rule, and the reason a
 * revoked seat and an unknown one answer alike rather than one of them 500ing.
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
    if (who === undefined || bearer === undefined) return Promise.resolve(problemAnswer(401))
    return Promise.resolve(route(state, { method, path, bearer, who }))
  }
