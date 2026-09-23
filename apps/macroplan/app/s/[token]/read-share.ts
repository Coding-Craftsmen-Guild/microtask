import type { Decoded } from '@repo/api-client'
import type { PlanShareView } from '@repo/contracts'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { linkCall, linkRead } from '../../../actions/link-call'
import type { ActionResult } from '../../../actions/result'
import { planScreenModel, type PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

/** What a seat's page learns about itself, or the sentence the API refused the question with. */
export type ShareRead = ActionResult<Decoded<typeof PlanShareView>>

/** The plan a seat opens, or the sentence the API refused it with. */
export type SeatPlanRead = ActionResult<PlanScreenModel>

const NOT_FOUND = 404

/**
 * Asks the API what this URL's token reaches: the bootstrap call every `/s/<token>` page makes
 * first, once per request.
 *
 * The token comes from the route's own `params` and is the only credential presented — no cookie is
 * read (ADR 0040). A segment that cannot be a token, and a 401 for one that no longer names a seat,
 * both reach the terminal page from inside `linkCall`, never `/login` (ADR 0032). So does a **404**,
 * which is what this route answers when the presented token holds no seat in the plan's manifest —
 * a seat revoked between minting the URL and opening it, and the same dead link by a narrower path.
 * A 404 is *this* function's to redirect on rather than `linkRead`'s to turn into `not-found.tsx`,
 * because a token that names nobody is not a plan that is missing.
 *
 * `cache` is what lets `generateMetadata` and the page share one request. It dedupes inside Next's
 * request scope and nowhere else, so a test sees one call per invocation and should not assert
 * otherwise.
 */
export const readShare = cache(async (token: string): Promise<ShareRead> => {
  const result = await linkCall(token, (api) => api.currentShare())
  if (!result.ok && result.status === NOT_FOUND) redirect(LINK_UNAVAILABLE_PATH)
  return result
})

/**
 * Reads the whole plan this URL's token opens, once per request.
 *
 * The second of the landing's two calls, and there is no way to make it one: `PlanShareView` carries
 * `{ id, name }` and stops, because repeating the plan in the bootstrap would be a second copy of
 * the largest response in the product — which is the departure from Microtask, whose bootstrap
 * carries its folders and tasks and whose list page therefore renders from one request.
 *
 * `planId` comes from {@link readShare}'s answer and never from the URL, so there is no id here a
 * visitor chose: a seat is rooted in one plan and the API decides which on every call (ADR 0053).
 *
 * {@link linkRead} rather than `linkCall`, so `missingIsNotFound` applies: a plan the API no longer
 * holds — deleted between the bootstrap and this read — is a **404** and renders `not-found.tsx`,
 * and an id that is not a ULID is a **422**, which the API's validator answers before any lookup.
 * The second cannot happen from a URL here, since the id was the API's own; it is in the set because
 * the page must not show "Macroplan could not complete that" for either. Every other refusal comes
 * back for the page to say, in this surface's words: a 403 is a real answer about authority, and an
 * unreachable API is not a missing plan.
 *
 * **The plan's other seats are dropped here, on the server.** The `shareLinks` block is present
 * exactly when the caller clears `share:read`, which a `manage` seat does — so a `manage` holder's
 * plan read really does come back carrying every live token on that plan. That is not an inference:
 * `packages/macroplan-domain/src/views/view-leaks.test.ts` serialises the view for a holder of each
 * role and requires a plan-scoped `manage` holder's to contain all three of its seats' tokens, the
 * route itself having nothing to refuse because `visibleLinks` shapes the block rather than gating it
 * (`apps/api/src/routes/macroplan/guard.test.ts` records exactly that). ADR 0033 is explicit that
 * such a block "may not be rendered into a **page**":
 * anything a Server Component hands a client component is serialised into the Flight stream and lands
 * in the HTML, and the seats a manager may list belong to the call its share manager makes when it
 * opens. Phase 2 draws no seats and holds no client component at all, so dropping them costs this
 * surface nothing and leaves nothing for phase 3 to leak by accident — the array has to be asked for
 * deliberately. What the block is dropped *into* is `PlanScreenModel`, whose `shareLinks?: never`
 * makes "return it unchanged" a compile error rather than a silent regression only a test could
 * catch — and which is `PlanScreen`'s own prop type, so this surface could not hand the component a
 * token even if this read stopped dropping it.
 *
 * {@link planScreenModel} rebuilds the plan field by field rather than stripping one name off it,
 * which is the admin surface's reduction and now the only one: a rest strip would carry a second
 * privileged block silently the day `PlanView` grows one, where a named copy makes that block a
 * compile error here. The rebuild is the same for a caller the API refused the block as for one it
 * served, and `shareLinks` is simply never written, so an absent block cannot become a
 * present-but-`undefined` one under `exactOptionalPropertyTypes`.
 */
export const readSeatPlan = cache(async (token: string, planId: string): Promise<SeatPlanRead> => {
  const read = await linkRead(token, (api) => api.plans.read(planId))
  return read.ok ? { ok: true, value: planScreenModel(read.value) } : read
})
