import { cache } from 'react'
import { adminRead, type ActionResult } from '../../../../actions/result'
import { planPath } from '../../../../lib/routes'
import { planPageModel, type PlanPageModel } from './plan-page-model'

/** What the plan page renders from: the plan minus its seats, or the sentence it was refused with. */
export type PlanRead = ActionResult<PlanPageModel>

/**
 * Reads one plan — its rails, its features, its items and the schedule derived from all three —
 * once per request.
 *
 * `cache` is what lets `generateMetadata` and the page component share a single request rather than
 * make two of the largest response in the product, and it is keyed on `planId`, so a page reading
 * two plans would still make two calls. This is the idiom
 * `apps/microtask/app/s/[token]/read-share.ts` and `components/projects/load.ts` both establish.
 *
 * {@link adminRead} rather than `adminCall`, so `missingIsNotFound` applies: a plan the API does not
 * hold is a **404**, and an id that is not a ULID is a **422** — the API validates `planId` as an
 * `EntityId` in `apps/api/src/routes/macroplan/params.ts`, so the validator refuses it before any
 * lookup — and both render `not-found.tsx` rather than a sentence in place of a timeline. A
 * hand-typed URL produces the second of those, which is why 422 is in that set and why a page using
 * `adminCall` here would show "Macroplan could not complete that" for a typo.
 *
 * Every other refusal comes back for the page to say: a 403 is a real answer about authority, and an
 * unreachable API is not a missing plan. An expired session redirects to `/login?next=` from inside
 * `adminCall`, carrying this page's own path so the admin lands back on the plan they were reading.
 *
 * **The plan's seats are dropped here, on the server**, by {@link planPageModel}. The reduction is
 * this function's rather than the page's so that no caller of `readPlan` — this page, its
 * `generateMetadata`, or whatever phase 3 adds beside them — is ever handed a token it could pass on.
 * `plans.read()` really does answer an admin with every live token on the plan, which
 * `packages/macroplan-domain/src/views/view-leaks.test.ts` requires of the view rather than leaves to
 * inference, and ADR 0033 forbids rendering that block into a page whoever is reading. The return
 * type is {@link PlanPageModel} and not `Plan`, so a future edit that handed the plan over unreduced
 * is a compile error and not merely a leak sweep away from shipping.
 */
export const readPlan = cache(async (planId: string): Promise<PlanRead> => {
  const read = await adminRead(planPath(planId), (api) => api.plans.read(planId))
  return read.ok ? { ok: true, value: planPageModel(read.value) } : read
})
