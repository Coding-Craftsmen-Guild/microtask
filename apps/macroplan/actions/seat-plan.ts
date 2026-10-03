'use server'

import type { PlanChange } from '@repo/api-client'
import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { linkCall } from './link-call'
import { seatWrite } from './plan-write'
import { LINK_UNAVAILABLE_PATH } from '../lib/routes'
import type { ActionFailure, ActionResult } from './result'
import type { PlanScreenModel } from '../components/plan/plan-screen-model'

/**
 * The three writes about a plan **itself**, each carrying the authority of one share token.
 *
 * The seat twins of `actions/plans.ts`, minus `createPlan`, which has no twin and cannot have one:
 * `workspace:create-plan` is admin-only in the kernel's policy (ADR 0009), so a seat is refused a new plan
 * whatever its role. The other three are all `manage`, so a plan-scoped `manage` seat holds every one of
 * them — it may rename, retime and delete the plan it was given. That is the API's own answer, not a
 * widening taken here.
 *
 * Each takes the token first so `seatPlanOwnActions` below can bind it in, and the page's leak sweep calls
 * every bound member to prove the token it carries is the visitor's own (`app/s/[token]/page.test.tsx`).
 */

/**
 * Renames the plan and answers the name the server **stored**.
 *
 * Not the name that was sent: `cleanName` collapses whitespace runs, so a field repainting what was typed
 * would show a name the plan does not have. The admin twin answers a string for the same reason.
 */
export async function seatRenamePlan(
  token: string,
  planId: string,
  name: string,
): Promise<ActionResult<string>> {
  const result = await linkCall(token, async (api) => (await api.plans.update(planId, { name })).name)
  if (result.ok) refresh()
  return result
}

/**
 * Retimes the plan — start date, sprint length, timezone — and answers the whole plan.
 *
 * It answers a plan where the rename answers a string because the schedule is derived and never stored
 * (spec §3.4): shifting the origin moves every bar and every sprint boundary while restructuring nothing.
 */
export async function seatRetimePlan(
  token: string,
  planId: string,
  timing: PlanChange,
): Promise<ActionResult<PlanScreenModel>> {
  return seatWrite(token, (api) => api.plans.update(planId, timing))
}

/**
 * Deletes the plan with everything on its rails, and leaves for the page a dead seat lands on.
 *
 * **It redirects to `/s/unavailable` and not to an index**, which is the one place this twin cannot mirror
 * its admin sibling. `deletePlan` sends an admin to `/`, the plans index; a seat has no index — it is
 * refused `workspace:list-plans` outright — and the plan whose URL it is holding no longer exists. So the
 * only truthful destination is the page that says the link no longer resolves, which is where this seat's
 * own next request would have landed anyway: deleting the plan revokes every seat on it, this one included,
 * inside the same locked write.
 *
 * That is worth pausing on, because it is the sharpest thing a `manage` seat can do: **deleting the plan
 * ends the caller's own access to it**. The confirm dialog says the share links stop working and nobody
 * holding one is told, which is true of the person clicking it too.
 */
export async function seatDeletePlan(
  token: string,
  planId: string,
): Promise<ActionFailure | undefined> {
  const result = await linkCall(token, (api) => api.plans.remove(planId))
  if (!result.ok) return result
  redirect(LINK_UNAVAILABLE_PATH)
}
