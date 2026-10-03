'use server'

import type { NewPlan, PlanChange } from '@repo/api-client'
import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { planPath, PLANS_INDEX_PATH } from '../lib/routes'
import { adminWrite } from './plan-write'
import { adminCall, type ActionFailure, type ActionResult } from './result'
import type { PlanScreenModel } from '../components/plan/plan-screen-model'

/**
 * Creates a plan and opens it, which is the only way a plan comes into existence on this surface.
 *
 * ### Why only a refusal comes back
 *
 * Success `redirect`s to the new plan, so the return type is a failure or nothing at all — the shape
 * `apps/microtask`'s `createProject` established, and for the same reason: a plan created and left
 * behind on the index is a plan somebody has to go and find, and the id it would be found by exists
 * for the first time in the response this action is holding. `redirect` works by throwing, so it is
 * called outside anything that catches, and the form treats an answer of `undefined` as success.
 *
 * ### Why it was the one plan action here, and no longer is
 *
 * This file held `createPlan` alone, and said the other three were deliberately absent because no
 * control called them. That reasoning was sound and its conclusion had gone stale in the worst
 * direction: a plan could be created and then never renamed, never retimed and never deleted, so a plan
 * given the wrong start date was wrong for ever and a plan made by mistake could not be removed. The
 * three are here now, each with a control, and the paragraph they replace is kept as a caution — "no
 * control calls it" is a reason to wait only while somebody is checking whether one should.
 *
 * ### Why it takes the whole draft
 *
 * A {@link NewPlan} rather than a name and a date beside it, for the reason `createEpic` takes a
 * `NewEpic`: `sprintLengthDays` and `timezone` are optional on the wire and the service decides each
 * default — 10 working days and `UTC` — so a positional parameter for either would leave "the value
 * nobody chose" with no spelling under `exactOptionalPropertyTypes`, and every call site building the
 * body anyway with a conditional spread.
 *
 * `workspace:create-plan` is admin-only in the kernel's policy, so there is no seat twin of this and
 * there cannot be one: a `manage` seat may rename, retime and delete the plan it holds and is still
 * refused a new one with a 403. `adminCall` re-derives the authority from `mp_admin` on every call,
 * because a Server Action is a public endpoint and nothing the browser sent is proof of anything.
 */
export async function createPlan(plan: NewPlan): Promise<ActionFailure | undefined> {
  const result = await adminCall(PLANS_INDEX_PATH, (api) => api.plans.create(plan))
  if (!result.ok) return result
  redirect(planPath(result.value.id))
}

/**
 * Renames one plan, answering the name the server **stored** rather than the one that was sent.
 *
 * Those differ: `cleanName` collapses every run of whitespace and caps the length, so a caller that
 * repainted its own string would show a name the plan does not have. `apps/microtask`’s `renameProject`
 * answers the stored name for exactly this reason and this is the same decision.
 *
 * It answers the **name** and not the plan, which is the one place this file departs from the structural
 * writes in `epics.ts`, `features.ts` and `items.ts`. Those answer a whole plan because they move bars:
 * a feature’s span is the sum of its items, so growing one pushes everything after it. A name moves
 * nothing on the axis at all, so the timeline the response would carry is the timeline already on screen,
 * and `refresh` is what repaints the parts that did change.
 */
export async function renamePlan(planId: string, name: string): Promise<ActionResult<string>> {
  const result = await adminCall(planPath(planId), async (api) => {
    const renamed = await api.plans.update(planId, { name })
    return renamed.name
  })
  if (result.ok) refresh()
  return result
}

/**
 * Retimes one plan — its start date, its sprint length, its timezone — and answers the whole plan.
 *
 * **This is the widest write in the product that restructures nothing.** Every date on the canvas is
 * derived from `startDate` and `sprintLengthDays` (spec §3.4: a schedule is never stored), so shifting the
 * origin shifts every bar and every sprint boundary at once while not one feature, item or edge is
 * touched. That is why it answers the plan where {@link renamePlan} beside it answers a string: what came
 * back is a different timeline drawn from the same structure.
 *
 * It takes a {@link PlanChange} rather than three parameters, and the three are optional on the wire, so
 * a caller sends only what it is changing. The API gates each field: a `name` needs `plan:rename` and any
 * of the three timing fields needs `plan:retime`. Both sit at `manage` today, so nothing can half-refuse
 * — but a body carrying a name **and** a date meets two gates, and the first refusal writes neither, so
 * this action deliberately cannot send a name. That is what keeps it one authority per call.
 */
export async function retimePlan(planId: string, timing: PlanChange): Promise<ActionResult<PlanScreenModel>> {
  return adminWrite(planId, (api) => api.plans.update(planId, timing))
}

/**
 * Deletes one plan with everything on its rails, and leaves for the index.
 *
 * ### Why only a refusal comes back
 *
 * The same shape {@link createPlan} has, arrived at from the opposite direction: a plan that is gone has
 * no page to stay on, so success `redirect`s to the index. It is the one Macroplan write whose client
 * method answers `void` at all — `plans.remove` — because what it removed leaves nothing behind to send.
 *
 * ### What it takes with it
 *
 * Every rail, every feature, every item, every item description file, and **every seat on the plan**. The
 * tokens stop resolving inside the same locked write that removes the files, so there is no window in
 * which a revoked client still gets in — `PlanService.remove` is handed the token index for that reason.
 * A holder of one of those seats is not told; their next request is a dead link. That is what the confirm
 * in `components/plan/settings/delete-plan.tsx` has to say before anybody chooses it.
 *
 * There is no `refresh` and there does not need to be one: `redirect` throws, so nothing after it runs,
 * and the index it lands on is a different route that reads its own list.
 */
export async function deletePlan(planId: string): Promise<ActionFailure | undefined> {
  const result = await adminCall(planPath(planId), (api) => api.plans.remove(planId))
  if (!result.ok) return result
  redirect(PLANS_INDEX_PATH)
}
