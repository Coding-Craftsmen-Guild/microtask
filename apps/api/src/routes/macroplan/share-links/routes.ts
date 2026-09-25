import { createRoute } from '@hono/zod-openapi'
import { CreatePlanShareLinkPayload, PlanShareLink, UpdateShareLinkPayload } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { planParams, planShareLinkParams } from '../params.js'

/**
 * Mint a seat on one plan. Answers **201**, and the body is the only place its token is ever shown.
 *
 * The payload is `CreatePlanShareLinkPayload` and **not** Microtask's `CreateShareLinkPayload`. They
 * differ in the one field that decides this route: Microtask's carries an optional `ProjectScope`,
 * so a body naming a plan fails that union and answers 422, where a plan has exactly one shareable
 * scope and its id is already in the path. So this payload is `{ name, role }` and nothing else, and
 * a `scope` key a client sends is **dropped by zod** rather than refused — the strongest form of
 * that refusal being a shape in which the field cannot exist at all. A payload able to re-scope a
 * mint would be a privilege escalation with a JSON body.
 *
 * There is no `GET` beside this one. A plan's seats arrive inside `PlanView.shareLinks`, present
 * exactly for a caller cleared for `share:read`, so there is one gate and one shape rather than two
 * of each.
 *
 * Gated on the scope being minted rather than on the path, for the reason `capabilities.ts` records
 * under `own-scope`: the narrowest scope a holder can mint over is the one it already holds. For a
 * plan-scoped holder that is this same plan, so the effective question is the plan — asked as the
 * scope being minted so the rule stays true if spec §7.1's epic variant ever arrives.
 *
 * Declares **409** beyond the common set, as `PUT …/dependencies` does and for a reason of its own.
 * Every write here goes through `PlanShareLinkService.#save`, which records the plan's whole token
 * set through `ShareIndex.add` before the manifest is written — and that call throws `Conflict` for a
 * token some **Microtask project** already holds, the two products drawing their ids and their tokens
 * from one index and separate sequences (ADR 0054). `errorHandler` passes an `AppError`'s status
 * through untouched, so the route really can answer 409 and said it could not. This is the route
 * where a *fresh* token is the colliding one; the two below collide differently.
 */
export const createPlanShareLinkRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['share-links'],
  summary: 'Mint a seat on one plan',
  security: GUARDED_SECURITY,
  request: {
    params: planParams,
    body: {
      required: true,
      content: { 'application/json': { schema: CreatePlanShareLinkPayload } },
    },
  },
  responses: {
    201: {
      description: 'The seat as minted, carrying the token it hands out',
      content: { 'application/json': { schema: PlanShareLink } },
    },
    ...problemResponses([409]),
  },
})

/**
 * Rename a seat or change its role. The token does **not** change (ADR 0035).
 *
 * That continuity is the whole reason this route exists rather than revoke-and-reissue: a new token
 * breaks the URL its holder has bookmarked, so a role change would read as "locked out until I send
 * you a new link" rather than "you now read only".
 *
 * `UpdateShareLinkPayload` is reused exactly as Microtask left it. It is already closed to `name`
 * and `role` and carries no refinement, so nothing in it is Microtask-specific: a client sending
 * `scope` or `token` has the key stripped. A plan seat has no scope to freeze in the first place.
 *
 * Gated `share:update` on the **plan**, which is where Microtask gates the same action on the
 * project: the question is "may this caller administer this plan's seats", not "may it reach what
 * this seat reaches". The gate runs before the plan is read, so a refused caller learns nothing
 * about whether that token exists.
 *
 * Declares **409** for the same mechanism as the mint above and a different cause. It mints no token,
 * so what `ShareIndex.add` is handed is the seats this plan already has — and that set collides only
 * where the manifest has come to hold a token another container owns **without** this API putting it
 * there. `warmTokenIndex` stops the boot on such a volume and an import refuses rather than records
 * one, so the state does not arise from anything this API does; a volume edited by hand is the case
 * spec §6 contemplates by name, and it is the caller's answer that changes rather than the plan's.
 * A status a service can throw is not a route's to predict away.
 */
export const updatePlanShareLinkRoute = createRoute({
  method: 'patch',
  path: '/{token}',
  tags: ['share-links'],
  summary: 'Rename a seat on one plan or change its role',
  security: GUARDED_SECURITY,
  request: {
    params: planShareLinkParams,
    body: { required: true, content: { 'application/json': { schema: UpdateShareLinkPayload } } },
  },
  responses: {
    200: {
      description: 'The seat as it now is, carrying the token it already had',
      content: { 'application/json': { schema: PlanShareLink } },
    },
    ...problemResponses([409]),
  },
})

/**
 * Revoke a seat and everything minted through it (ADR 0010). Answers **204**.
 *
 * The 204 is deliberate, and it is the one place this subtree departs from "every mutating route
 * answers the whole `PlanView`": revoking a seat moves no bar on the canvas, so there is no derived
 * state for a response to carry. A caller wanting the remaining seats re-reads the plan.
 *
 * Nor does it report the cascade the way Microtask's revoke does. The tokens it dropped are gone
 * from the index in the same locked write, so the claim a list would make is already observable —
 * each revoked token now answers 401 on any route of this product.
 *
 * Gated on the plan before the store is asked whether that token exists, like the rename beside it.
 * Deriving the target from the seat would mean reading it first, and this would become the one route
 * in the tree answering 404 ahead of 403 — telling a caller the policy refuses that a token, or a
 * plan, is real.
 *
 * Declares **409** exactly as the rename above does, and for that same cause: `#save` presents the
 * seats that remain to `ShareIndex.add`, which replaces the plan's whole token set rather than
 * deleting from it, so a token another container owns is refused here as well. It is the one of the
 * three whose 409 would be surprising — a revoke takes tokens away — and that is why it is written
 * down rather than left for a reader to rule out.
 */
export const revokePlanShareLinkRoute = createRoute({
  method: 'delete',
  path: '/{token}',
  tags: ['share-links'],
  summary: 'Revoke a seat and every seat minted through it',
  security: GUARDED_SECURITY,
  request: { params: planShareLinkParams },
  responses: {
    204: { description: 'The seat and its descendants are gone, and their tokens with them' },
    ...problemResponses([409]),
  },
})
