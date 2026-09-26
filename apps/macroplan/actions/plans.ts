'use server'

import type { NewPlan } from '@repo/api-client'
import { redirect } from 'next/navigation'
import { planPath, PLANS_INDEX_PATH } from '../lib/routes'
import { adminCall, type ActionFailure } from './result'

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
 * ### Why it is the one plan action here and not one of four
 *
 * `plan:rename`, `plan:retime` and `plan:delete` are real routes of the API with no control on either
 * surface, and `lib/plan-capabilities.ts` records that as deliberate — a boolean for a write no
 * control can call would answer a question nobody asks. Creating is not in that group: without it the
 * product has no first plan, so the index renders its empty state for ever and every other write in
 * the app is unreachable. That is the whole argument for this file existing while its three siblings
 * do not, and it is the reason to add the other three **when a control needs them** rather than now.
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
