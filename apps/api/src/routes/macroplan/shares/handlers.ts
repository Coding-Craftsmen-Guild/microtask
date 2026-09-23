import type { RouteHandler } from '@hono/zod-openapi'
import type { PlanScope, Principal } from '@repo/kernel'
import { Forbidden, NotFound } from '@repo/kernel'
import type { PlanManifest, PlanService, PlanShareLink } from '@repo/macroplan-domain'
import { authorize, notPermitted } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { currentPlanShareRoute } from './routes.js'

const NO_SEAT = 'This credential does not name a share link'

type PlanLink = Extract<Principal, { kind: 'link' }> & { readonly scope: PlanScope }

const actingSeat = (principal: Principal): PlanLink => {
  if (principal.kind !== 'link') throw new NotFound(NO_SEAT)
  if (principal.scope.kind !== 'plan') throw new Forbidden(notPermitted('plan:read'))
  return { ...principal, scope: principal.scope }
}

const storedSeat = (manifest: PlanManifest, token: string): PlanShareLink => {
  const found = manifest.shareLinks.find((seat) => seat.token === token)
  if (found === undefined) throw new NotFound(NO_SEAT)
  return found
}

/**
 * Describes the seat the caller presented, and the plan it reaches.
 *
 * The token comes from `c.get('principal')` — never from a path segment and never from a header
 * schema — so the credential stays in the `Authorization` header where it cannot reach a log line or
 * a `Referer` (ADR 0013). The view it builds carries no token at all, its own included: the caller
 * already has the one it sent, and a response with no token field cannot leak somebody else's.
 *
 * An admin credential names no seat, so it is answered 404 rather than 403: it is not refused the
 * question, there is simply no current seat to describe. Narrowing to a link before the gate is also
 * what lets the single `authorize` call have a target at all — the target is the caller's own scope
 * root, and an admin has no scope to derive one from.
 *
 * The acting seat is narrowed to a **plan-rooted** scope, and that narrowing is **checked** rather
 * than cast: one token index serves both products, so `PrincipalResolver.resolve` can legitimately
 * return a project-scoped link here, and `principal as PlanLink` would be asserting in the
 * authorization path something no code had established. The check is the discriminant of the
 * kernel's own `Scope` union, which is what earns `PlanScope` instead of claiming it.
 *
 * **It calls `authorize`, and that is not ceremony.** What refuses a Microtask holder is
 * `requireProduct` at the mount, before this handler runs; the gate stays because a middleware
 * refusal is invisible to the compiler and because `plan:read` on a plan target is refused to a
 * project scope **by the policy** rather than by anything written here — so the line holds on the day
 * the mount changes. The `Forbidden` above is worded by `notPermitted` rather than by hand for the
 * same reason: the two layers cannot disagree if some future mount forgets the guard.
 *
 * The bootstrap stays reachable. A holder asking about its **own** scope is cleared by `plan:read`,
 * which every plan role has, so the gate refuses only a caller asking about a plan that is not its
 * own — which is the one question this route must not answer.
 *
 * The stored seat is looked up rather than rebuilt from the principal, so what the caller is told is
 * what the manifest holds. Resolution found it a moment ago, so its absence means it was revoked in
 * between — a real race, and one that must answer the same 404 as an unknown token rather than a 500.
 */
export const readCurrentPlanShare =
  (plans: PlanService): RouteHandler<typeof currentPlanShareRoute, ApiEnv> =>
  async (c) => {
    const seat = actingSeat(c.get('principal'))
    const { planId } = seat.scope
    authorize(c, 'plan:read', { kind: 'plan', planId })
    const manifest = await plans.read({ product: PRODUCT, planId })
    const stored = storedSeat(manifest, seat.token)
    return c.json(
      {
        role: stored.role,
        scope: seat.scope,
        plan: { id: manifest.id, name: manifest.name },
      },
      200,
    )
  }
