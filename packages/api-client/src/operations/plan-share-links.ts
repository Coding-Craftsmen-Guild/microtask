import {
  PlanShareLink,
  type CreatePlanShareLinkPayload,
  type UpdateShareLinkPayload,
} from '@repo/contracts'
import { planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

const seatsPath = (planId: string): string => `${planPath(planId)}/share-links`

const seatPath = (planId: string, token: string): string =>
  `${seatsPath(planId)}/${encodeURIComponent(token)}`

/**
 * The seat to mint: who it is for, and what authority it carries.
 *
 * Macroplan's own `CreatePlanShareLinkPayload` rather than the `CreateShareLinkPayload` a project
 * seat is minted with, and the difference is the field that is **absent**: there is no `scope`, so no
 * body a caller assembles can point the new seat at a plan other than the one in the path. A project
 * seat must be given one because it may be narrower than its project;
 * `packages/contracts/src/plan-share-payloads.ts` is where the decision that a plan has no such pair
 * to choose between is recorded.
 */
export type NewPlanSeat = Decoded<typeof CreatePlanShareLinkPayload>

/**
 * What may be changed about a seat that already exists: its name, its role, or neither.
 *
 * It borrows Microtask's `UpdateShareLinkPayload` unchanged, which is the one payload reachable from
 * this product that carries **no non-empty refinement**. Every `Update*Payload` a plan route takes
 * refuses `{}` with a 422; this one accepts it, so an empty change is a well-formed **200 with the
 * seat as it was** rather than a validation error. A form that submitted nothing is therefore
 * indistinguishable, to the caller, from a form that saved — and a caller that needs to tell them
 * apart has to compare what it sent against the seat that came back.
 */
export type PlanSeatChange = Decoded<typeof UpdateShareLinkPayload>

/**
 * The seats one plan hands out: minted, re-roled, revoked.
 *
 * **There is no `list`.** A plan's seats arrive inside the `shareLinks` block of the plan a read
 * answers, present exactly when the API cleared this caller for `share:read`, so a manager reads them
 * off a plan and there is nothing here to call for them. That is one gate and one shape rather than
 * two of each, and `packages/contracts/src/capabilities.ts` is where the `share:read` row records
 * that no route decides it.
 */
export interface PlanShareLinksApi {
  /**
   * Mints a seat on one plan. The token in the response is the only time it is handed back in full.
   *
   * Answers **201**, and the seat rather than the plan: a new seat moves no bar on the canvas, so
   * there is no derived timeline for the response to carry.
   *
   * It is the one of these three the API decides against the **scope being minted** rather than
   * against the plan in the path — `packages/contracts/src/capabilities.ts` calls that target
   * `own-scope` — and the two questions have the same answer for a plan-scoped holder, since the
   * narrowest scope it can mint over is the plan it already holds.
   *
   * A UI deciding whether to draw these controls still has to ask about them differently, which is
   * the reason that distinction matters here at all: `capabilities()` answers `share:create`
   * directly, while `share:update` and `share:revoke` come back **false** for a plan-scoped holder,
   * their row naming the other product's target, and have to be asked again through `mayReach` with
   * `'plan'`.
   */
  create(planId: string, seat: NewPlanSeat): Promise<Decoded<typeof PlanShareLink>>

  /**
   * Renames a seat or changes its role, **keeping the token its holder already has**.
   *
   * That continuity is the whole reason the route exists rather than revoke-and-reissue (ADR 0035): a
   * fresh token would break the URL already bookmarked, so a downgrade would read as a lockout rather
   * than as a narrowing. The new role takes effect on the holder's next request, the API reading it
   * from the plan every time.
   *
   * See {@link PlanSeatChange} before wiring this to a form: an empty change is a 200 and not a 422.
   */
  update(planId: string, token: string, change: PlanSeatChange): Promise<Decoded<typeof PlanShareLink>>

  /**
   * Revokes one seat and every seat minted through it, and answers **nothing**.
   *
   * The 204 is why this is the one call here typed `Promise<void>`, and the cost is that **the
   * cascade is unreportable**. The domain's `revoke` computes the lineage it dropped and the route
   * discards it, there being no contract for it to answer with: a project revoke has
   * `RevokedShareLinks` and Macroplan deliberately has no counterpart. So a manager cannot say "and
   * these three descendants went dark with it", and there is no second read that recovers the set —
   * the descendants are gone from the plan by the time anything could ask. What is observable instead
   * is the effect: every token in that lineage now answers 401 on every route of this product.
   *
   * A token belonging to another plan is a **404**, not a 403: the caller was already cleared on the
   * plan in the path, and the plan in the path holds no such seat.
   */
  revoke(planId: string, token: string): Promise<void>
}

/** Binds the plan seat operations to a transport. */
export function planShareLinksApi(transport: Transport): PlanShareLinksApi {
  return {
    create: (planId, seat) =>
      transport.json({ method: 'POST', path: seatsPath(planId), body: seat }, PlanShareLink),
    update: (planId, token, change) =>
      transport.json(
        { method: 'PATCH', path: seatPath(planId, token), body: change },
        PlanShareLink,
      ),
    revoke: (planId, token) => transport.empty({ method: 'DELETE', path: seatPath(planId, token) }),
  }
}
