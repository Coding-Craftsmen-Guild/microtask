import type { RouteHandler } from '@hono/zod-openapi'
import { Invalid } from '@repo/kernel'
import type { EpicService } from '@repo/macroplan-domain'
import { planView } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import type { Bindings, BindingRefusal, SeatScope } from '../../../bridge/bindings.js'
import { PRODUCT as MICROTASK } from '../../microtask/product.js'
import { PRODUCT } from '../product.js'
import type {
  bindEpicRoute,
  bindProjectRoute,
  createEpicRoute,
  deleteEpicRoute,
  placeEpicRoute,
  unbindEpicRoute,
  updateEpicRoute,
} from './routes.js'

/**
 * The sentence each refusal to bind is reported with.
 *
 * A closed record keyed by {@link BindingRefusal}, so a third reason added there is a compile error
 * here rather than a refusal that reaches an admin as an empty detail.
 */
export const BIND_REFUSALS: Readonly<Record<BindingRefusal, string>> = {
  unknown: 'That token names no Microtask project. Paste the token of a project share link.',
  weaker: 'That token holds less in Microtask than the role asked for here.',
}

/**
 * The sentence each refusal is reported with when the API minted the seat itself.
 *
 * Different words from {@link BIND_REFUSALS} for the same two cases, because the fix is different: nobody
 * pasted anything here, so "paste the token of a project share link" would be advice about a field that is
 * not on screen. Both are close to unreachable on this path — a project that does not exist answers 404 from
 * the store before a seat is minted, and a seat minted at a role cannot hold less than that role — and they
 * are worded rather than collapsed into one because a reader meeting either needs to know which happened.
 */
export const MINT_REFUSALS: Readonly<Record<BindingRefusal, string>> = {
  unknown: 'That project could not be reached after its seat was minted. Try binding it again.',
  weaker: 'The seat minted for that project holds less than the role asked for.',
}

/**
 * Adds a rail at the bottom of the plan and answers the whole plan.
 *
 * The target is `{ kind: 'epic' }` carrying the **validated** `planId` and no epic id, which is the
 * shape `Target` declares: a plan is shared at plan scope and nothing narrower exists (ADR 0053), so
 * no rule turns on an epic id and a field no rule reads is one that will one day be compared wrongly.
 * The gate is still the only thing standing between a seat on one plan and another, because the
 * product guard at the mount refuses the other product and not another plan inside this one.
 */
export const createEpic =
  (epics: EpicService): RouteHandler<typeof createEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const draft = c.req.valid('json')
    const principal = authorize(c, 'epic:create', { kind: 'epic', planId })
    const updated = await epics.add({ product: PRODUCT, planId }, draft)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Renames one rail, recolours it, or both, and answers the whole plan.
 *
 * One gate, because `UpdateEpicPayload` carries one authority: a rail's name and its colour are both
 * `epic:rename`, and there is no second action for a body that changes only the colour to ask for.
 * The payload declares no `binding`, so zod has already stripped one before this runs.
 */
export const updateEpic =
  (epics: EpicService): RouteHandler<typeof updateEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const principal = authorize(c, 'epic:rename', { kind: 'epic', planId })
    const updated = await epics.update({ product: PRODUCT, planId }, epicId, changes)
    return c.json(planView(updated, principal), 200)
  }

/** Moves one rail among its siblings, renumbering them densely, and answers the whole plan. */
export const placeEpic =
  (epics: EpicService): RouteHandler<typeof placeEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const { railOrder } = c.req.valid('json')
    const principal = authorize(c, 'epic:reorder', { kind: 'epic', planId })
    const updated = await epics.place({ product: PRODUCT, planId }, epicId, railOrder)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Removes one rail, its features and their items, and answers the plan that remains.
 *
 * The principal `authorize` returns is used, unlike `deletePlan` beside it: there is still a plan to
 * shape here, so the share block is decided per principal exactly as it is on a read.
 */
export const deleteEpic =
  (epics: EpicService): RouteHandler<typeof deleteEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const principal = authorize(c, 'epic:delete', { kind: 'epic', planId })
    const updated = await epics.remove({ product: PRODUCT, planId }, epicId)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Binds one rail to a Microtask project, deriving the project from the token the admin pasted.
 *
 * Two 422 sentences rather than one, because an admin fixes the two differently: a token that names no
 * project is "paste a project share token from Microtask", and a token weaker than the role asked for
 * is "that seat holds less than that — re-role it there, or bind at the role it has".
 *
 * The gate is asked **before** the token is resolved. Resolving reads a project manifest in the other
 * product, and a caller with no authority here should not be able to make this API go and look
 * something up in Microtask on the strength of a string it supplied.
 */
export const bindEpic =
  (epics: EpicService, bindings: Bindings): RouteHandler<typeof bindEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const { token, role } = c.req.valid('json')
    const principal = authorize(c, 'epic:bind', { kind: 'epic', planId })
    const prepared = await bindings.prepare(token, role)
    if (!prepared.ok) throw new Invalid(BIND_REFUSALS[prepared.reason])
    const updated = await epics.bind({ product: PRODUCT, planId }, epicId, prepared.binding)
    return c.json(planView(updated, principal), 200)
  }


/**
 * Binds one rail to a named Microtask project, minting and sealing its seat in this one request.
 *
 * ### Two gates, in this order, and both are load-bearing
 *
 * `epic:bind` on the plan first, because a caller with no authority over this plan must not be able to make
 * the API go and **write** to the other product on the strength of a string it supplied — the same reason
 * {@link bindEpic} gates before resolving a pasted token, one step stronger because this one creates rather
 * than reads.
 *
 * `share:create` on the scope second, and it is the **same value** that is then minted rather than a second
 * derivation of it — the property `createShareLink` states for itself one product over: "the question the
 * policy answered and the scope that gets stored are the same value". A gate built from one expression and a
 * mint built from another could drift, and the drift would be a seat minted over something the policy was
 * never asked about.
 *
 * It is second rather than first because `epic:bind` is in `ADMIN_ONLY_ACTIONS`, so in practice only
 * admins reach the second line and they always clear it — which is exactly why it is written. It is the check
 * that refuses the day `epic:bind` stops being admin-only, and ADR 0052 leaves an epic-scoped seat open as an
 * additive change. A route that relied on the first gate implying the second would grant minting to whoever
 * that change admitted, silently.
 *
 * ### The seat is minted in Microtask and the plan is written in Macroplan
 *
 * Two product tags in one handler, which is why both are imported under names that cannot be confused:
 * `MICROTASK` is where the credential is created and `PRODUCT` is where the binding is stored. A single
 * `PRODUCT` here would mint against a Macroplan project that does not exist.
 *
 * The response is `planView(updated, principal)`, exactly as the pasted path answers, so nothing about this
 * route is visible to a client beyond the rail now reading as bound: no body here carries the token, and
 * `EpicBindingView` has no field for one to go in.
 */
export const bindEpicProject =
  (epics: EpicService, bindings: Bindings): RouteHandler<typeof bindProjectRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const { projectId, role } = c.req.valid('json')
    const principal = authorize(c, 'epic:bind', { kind: 'epic', planId })
    const scope: SeatScope = { kind: 'project', projectId }
    authorize(c, 'share:create', scope)
    const prepared = await bindings.mint(scope, role, MICROTASK)
    if (!prepared.ok) throw new Invalid(MINT_REFUSALS[prepared.reason])
    const updated = await epics.bind({ product: PRODUCT, planId }, epicId, prepared.binding)
    return c.json(planView(updated, principal), 200)
  }

/** Unbinds one rail, leaving every item's link in place, and answers the plan. */
export const unbindEpic =
  (epics: EpicService): RouteHandler<typeof unbindEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const principal = authorize(c, 'epic:bind', { kind: 'epic', planId })
    const updated = await epics.unbind({ product: PRODUCT, planId }, epicId)
    return c.json(planView(updated, principal), 200)
  }
