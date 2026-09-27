'use server'

import type { NewPlanSeat, PlanSeatChange } from '@repo/api-client'
import { refresh } from 'next/cache'
import { changeOf, type Seat } from './share-parts'
import { linkCall } from './link-call'
import type { ActionResult } from './result'

/**
 * The four seat-management writes, each carrying the authority of **one share token**.
 *
 * ### Why these are a separate module from `plan-share-links.ts`
 *
 * The same reason `seat-writes.ts` is separate from `epics.ts`, `features.ts` and `items.ts`: a Server
 * Action's credential is decided by which function was called, never by an argument, so an admin twin and a
 * seat twin cannot share a body. `adminCall` re-derives authority from `mp_admin`; `linkCall` presents the
 * token it was handed. Two modules is what makes that a compile-time fact rather than a parameter somebody
 * could pass wrongly.
 *
 * ### Why a seat may administer seats at all
 *
 * `capabilities()` answers a plan-scoped `manage` seat **`true` on all four `share:*` questions** —
 * `share:read`, `share:update` and `share:revoke` through `mayReach` with `'plan'`, because those rows name a
 * `project` target that one `GRANTS` row serves for both products, and `share:create` off the record because
 * its target is `own-scope` (ADR 0038, ADR 0053). So this is the API's own answer rather than a widening
 * taken here, and it is what ADR 0035 means by a seat that can hand on part of what it holds: a minted seat
 * is bounded by the minter's own scope and role, and revoking a seat takes every seat minted through it.
 *
 * ### The token is the first parameter of each, and that is load-bearing
 *
 * Each takes `(token, planId, …)`, so `seatSeatActions` in `components/plan/share/seat-manager-actions.ts`
 * can bind the token in and the four members it produces match the shapes `ShareManager` takes. The page's
 * own leak sweep then **calls** each bound member and asserts the token it carries is the visitor's own
 * (`app/s/[token]/page.test.tsx`), which is the check that made mounting any of this safe.
 *
 * Every one of the four is wired whatever the seat's role, because a control is a rendering answer and a
 * grant is the API's: a `view` seat handed these still may do none of them, and what stops it is the 403 the
 * API answers rather than an absent member.
 */

/** Reads this plan's seats, which arrive inside the plan rather than from a list endpoint. */
export async function seatReadSeats(
  token: string,
  planId: string,
): Promise<ActionResult<readonly Seat[]>> {
  return linkCall(token, async (api) => (await api.plans.read(planId)).shareLinks ?? [])
}

/**
 * Mints a seat on this plan, bounded by what the minting seat itself holds.
 *
 * No `refresh`, for the reason the admin twin gives: nothing the screen renders is derived from a seat, so
 * a re-render would rebuild 2,200 table rows and 2,000 SVG nodes under an open dialog to change nothing.
 * The manager puts the minted seat into the list it is already holding.
 */
export async function seatCreateSeat(
  token: string,
  planId: string,
  seat: NewPlanSeat,
): Promise<ActionResult<Seat>> {
  return linkCall(token, (api) => api.shareLinks.create(planId, seat))
}

/**
 * Renames a seat or changes its role, keeping its token so the holder's URL still works (ADR 0035).
 *
 * Only `name` and `role` are forwarded, whatever else arrived beside them: a Server Action is a public
 * endpoint, so `change` is whatever the browser sent. `changeOf` is the same guard the admin twin uses, and
 * the API's zod remains the gate.
 */
export async function seatUpdateSeat(
  token: string,
  planId: string,
  seatToken: string,
  change: PlanSeatChange,
): Promise<ActionResult<Seat>> {
  return linkCall(token, (api) => api.shareLinks.update(planId, seatToken, changeOf(change)))
}

/**
 * Revokes one seat and every seat minted through it, answering nothing (ADR 0010).
 *
 * **A seat may revoke its own.** Nothing here prevents it and nothing should: the token in the path is the
 * seat being acted on and the bearer is the caller's own, so they may be the same seat, and a holder ending
 * its own access is a legitimate thing to do. What it costs is that the page it was on stops resolving on
 * the next request — which is what a revoked seat means, and `/s/unavailable` is where that lands.
 *
 * `refresh` runs on success, unlike the mint: a revoked seat is gone from the list and from the plan, so the
 * manager's own copy is stale in a way it cannot repair from the answer — the answer is nothing.
 */
export async function seatRevokeSeat(
  token: string,
  planId: string,
  seatToken: string,
): Promise<ActionResult<void>> {
  const result = await linkCall(token, (api) => api.shareLinks.revoke(planId, seatToken))
  if (result.ok) refresh()
  return result
}
