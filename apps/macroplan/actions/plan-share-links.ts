'use server'

import type { Decoded, NewPlanSeat, PlanSeatChange } from '@repo/api-client'
import type { PlanShareLink } from '@repo/contracts'
import { planPath } from '../lib/routes'
import { adminCall, type ActionResult } from './result'

type Seat = Decoded<typeof PlanShareLink>

const changeOf = (sent: PlanSeatChange): PlanSeatChange => ({
  ...(sent.name !== undefined && { name: sent.name }),
  ...(sent.role !== undefined && { role: sent.role }),
})

/**
 * Every seat on one plan, token and all — asked for when the share manager **opens**.
 *
 * This is the only way a token reaches this browser, and it is on demand. Neither plan surface
 * renders a seat: `planScreenModel` drops the block on the server and its `shareLinks?: never` makes
 * carrying one a compile error, so no token is in a page's HTML or Flight payload and one arrives
 * only in the answer to this call, made after the dialog that exists to show it is open (ADR 0033).
 *
 * **It re-reads the plan, because there is no seats endpoint to call.** `POST`, `PATCH` and `DELETE`
 * are the only three routes under `…/share-links` (`apps/api/src/routes/macroplan/share-links/routes.ts`):
 * a plan's seats arrive inside `PlanView.shareLinks`, present exactly for a caller the API cleared for
 * `share:read` on that plan (`visibleLinks`, `packages/macroplan-domain/src/views/plan-view.ts`), which
 * is one gate and one shape rather than two of each. So the read is the plan read, and the block is what
 * this answers.
 *
 * The block is **absent** rather than empty for a caller refused it, which is why the `?? []` is here
 * and what it means: an admin is never that caller — `can()` short-circuits on `principal.kind ===
 * 'admin'` before any scope or grant is read — and an expired admin never reaches this line, since
 * `adminCall` redirects a 401 to `/login?next=`. The fallback is what the optional field costs, not a
 * second sentence about authority.
 *
 * It answers the seats it was given and narrows nothing: a plan seat carries no scope, so there is no
 * counterpart to `apps/microtask/actions/share-link-parts.ts`'s `listedFor` and nothing here to filter
 * a plan's own seats by.
 */
export async function readPlanSeats(planId: string): Promise<ActionResult<readonly Seat[]>> {
  return adminCall(planPath(planId), async (api) => (await api.plans.read(planId)).shareLinks ?? [])
}

/**
 * Mints a seat on one plan and answers it: the one response that hands a token back.
 *
 * It sends `{ name, role }` and can send nothing else, `CreatePlanShareLinkPayload` declaring no
 * `scope` — a plan has exactly one shareable scope and the path already names it, so no body this app
 * assembles can point a new seat at another plan (`packages/contracts/src/plan-share-payloads.ts`).
 * The API decides this one against **the scope being minted** rather than the plan in the path, which
 * is why `planCapabilities` reads `share:create` off the capability record where it asks `mayReach`
 * for the other three (`lib/plan-capabilities.ts`).
 *
 * `createdBy` is the API's from the credential that presented the request, never the body's, so a seat
 * cannot claim a parent it was not minted through — and that field is what the revocation cascade
 * walks (ADR 0010).
 *
 * **No `refresh()`**, and that is the one place these four depart from `epics.ts` and its siblings.
 * `refresh` exists so a page rendered from a stale read is rebuilt, and nothing either plan surface
 * renders is derived from a seat: the screen's own model cannot hold one. A refresh would rebuild
 * 2,200 table rows and 2,000 SVG nodes under an open dialog to change nothing on screen. The manager
 * puts the minted seat into the list it is already holding.
 */
export async function createPlanSeat(planId: string, seat: NewPlanSeat): Promise<ActionResult<Seat>> {
  return adminCall(planPath(planId), (api) => api.shareLinks.create(planId, seat))
}

/**
 * Renames a seat or changes its role, **keeping its token** so the holder's URL still works.
 *
 * That continuity is why the route exists rather than revoke-and-reissue: a fresh token would break a
 * bookmarked URL, so a downgrade would read as a lockout rather than as a narrowing (ADR 0035).
 *
 * Only `name` and `role` are forwarded, whatever else arrived beside them. A Server Action is a public
 * endpoint, so `change` is whatever the browser sent; the API's zod strips the rest and stays the gate,
 * and this is so the request this app sends says exactly what its own UI asked for —
 * `apps/microtask/actions/share-link-parts.ts`'s `changeOf` is the same guard, for a payload this one
 * reuses.
 *
 * **An empty change is a well-formed 200 here, not a 422.** `UpdateShareLinkPayload` is the one payload
 * this product reaches that carries no non-empty refinement, where every plan `Update*Payload` refuses
 * `{}` — so an edit that asked for nothing answers the seat as it was, and a caller cannot tell it from
 * one that saved. This action stays a faithful pipe and does not invent a refusal the API does not make:
 * the form is where an empty edit is refused (`components/plan/share/seat-row.tsx`), before a request
 * exists.
 */
export async function updatePlanSeat(
  planId: string,
  token: string,
  change: PlanSeatChange,
): Promise<ActionResult<Seat>> {
  return adminCall(planPath(planId), (api) => api.shareLinks.update(planId, token, changeOf(change)))
}

/**
 * Revokes one seat and every seat minted through it, and answers **nothing** (ADR 0010).
 *
 * The route answers 204 and the service's own computed lineage is discarded by the handler, there
 * being no `RevokedShareLinks` contract in this product where Microtask has one. So this cannot answer
 * "and these three descendants went with it", and no second read recovers the set — the descendants are
 * gone from the plan by the time anything could ask. What follows for the UI is that the warning has to
 * come **before** the write: the confirm dialog says the cascade will happen, because afterwards there
 * is nothing left to report (`components/plan/share/seat-words.ts`).
 *
 * A token belonging to another plan is a 404 and not a 403: the caller was already cleared on the plan
 * in the path, and that plan holds no such seat.
 */
export async function revokePlanSeat(planId: string, token: string): Promise<ActionResult<void>> {
  return adminCall(planPath(planId), (api) => api.shareLinks.revoke(planId, token))
}
