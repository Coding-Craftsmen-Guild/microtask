import type { RouteHandler } from '@hono/zod-openapi'
import { NotFound, type Principal } from '@repo/kernel'
import type { PlanManifest, PlanShareLink, PlanShareLinkService } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createPlanShareLinkRoute,
  revokePlanShareLinkRoute,
  updatePlanShareLinkRoute,
} from './routes.js'

const mintedBy = (principal: Principal): string | null =>
  principal.kind === 'link' ? principal.token : null

const seatIn = (manifest: PlanManifest, token: string): PlanShareLink => {
  const found = manifest.shareLinks.find((seat) => seat.token === token)
  if (found === undefined) throw new NotFound('Share link not found')
  return found
}

/**
 * Mints a seat over one plan, and answers 201 with the only copy of its token.
 *
 * The scope is built from the **validated** `planId` and handed to the gate, so the question the
 * policy answered is the plan the path names. It is passed as a value rather than written inline
 * because the action it gates is recorded against `own-scope`: the narrowest scope a holder can mint
 * over is the one it already holds, which for a plan-scoped holder is this same plan. Written as the
 * scope being minted, the rule survives spec §7.1's epic variant arriving; written as a literal
 * plan, it would have to be revisited.
 *
 * Nothing here can re-scope the mint. `CreatePlanShareLinkPayload` declares no `scope`, so a body
 * naming a different plan has the key dropped by zod before this runs, and `NewSeat` has no member
 * to carry one — the stored seat holds no scope at all, and the one it reaches is the plan whose
 * manifest it lives in.
 *
 * `createdBy` comes from the credential that presented the request and never from the body, so a
 * seat cannot claim a parent it was not minted through. That field is what the revocation cascade
 * walks, and a seat free to choose its own parent could place itself outside the subtree a leaked
 * manager takes with it (ADR 0010). The admin records `null`, having no seat to descend from.
 */
export const createPlanShareLink =
  (seats: PlanShareLinkService): RouteHandler<typeof createPlanShareLinkRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const request = c.req.valid('json')
    const scope = { kind: 'plan', planId } as const
    const principal = authorize(c, 'share:create', scope)
    const minted = await seats.create(
      { product: PRODUCT, planId },
      { name: request.name, role: request.role, createdBy: mintedBy(principal) },
    )
    return c.json(minted.link, 201)
  }

/**
 * Renames a seat or changes its role, keeping the token its holder has bookmarked (ADR 0035).
 *
 * Gated on the plan rather than on what the seat reaches, which is what puts `share:update` beside
 * `share:revoke` and away from `share:create`: the question is whether this caller may administer
 * this plan's seats. `ACTION_DECISIONS` records that target for Macroplan under `alsoGatedOn`,
 * because the same action is gated on a `project` in the other product.
 *
 * The service answers the saved manifest rather than the seat, so the seat is read back out of the
 * value this call produced — never by a second read, which outside the lock could hand back a later
 * writer's plan. The `NotFound` that read can raise is unreachable through this route: `update`
 * already threw it for an unknown token, and the seat it wrote is in the manifest it returned.
 */
export const updatePlanShareLink =
  (seats: PlanShareLinkService): RouteHandler<typeof updatePlanShareLinkRoute, ApiEnv> =>
  async (c) => {
    const { planId, token } = c.req.valid('param')
    const changes = c.req.valid('json')
    authorize(c, 'share:update', { kind: 'plan', planId })
    const saved = await seats.update({ product: PRODUCT, planId }, token, changes)
    return c.json(seatIn(saved, token), 200)
  }

/**
 * Revokes a seat and every seat minted through it, and answers 204 with no body.
 *
 * `authorize` is called for its refusal and not for the principal it returns: there is nothing left
 * to shape per principal once the seats are gone. The service drops the plan's tokens from the index
 * in the same locked write that saves the manifest, so a revoked token stops resolving on every
 * route of this product rather than only on this plan's.
 *
 * A token belonging to another plan answers **404** and not 403: the gate cleared this caller on the
 * plan in the path, and the plan in the path holds no such seat. A 403 there would claim an
 * authority problem, and either status would confirm nothing about whether that seat exists.
 */
export const revokePlanShareLink =
  (seats: PlanShareLinkService): RouteHandler<typeof revokePlanShareLinkRoute, ApiEnv> =>
  async (c) => {
    const { planId, token } = c.req.valid('param')
    authorize(c, 'share:revoke', { kind: 'plan', planId })
    await seats.revoke({ product: PRODUCT, planId }, token)
    return c.body(null, 204)
  }
