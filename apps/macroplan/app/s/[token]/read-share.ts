import type { Decoded, Plan } from '@repo/api-client'
import type { PlanShareView } from '@repo/contracts'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { linkCall, linkRead } from '../../../actions/link-call'
import type { ActionResult } from '../../../actions/result'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

/** What a seat's page learns about itself, or the sentence the API refused the question with. */
export type ShareRead = ActionResult<Decoded<typeof PlanShareView>>

/**
 * The plan a seat's page renders from: everything `PlanView` holds, with the plan's seats made
 * **unrepresentable** rather than merely dropped.
 *
 * `Omit` alone would not be worth writing. A `Plan` is still structurally assignable to
 * `Omit<Plan, 'shareLinks'>` — TypeScript checks for excess properties only on fresh object
 * literals — so a future edit returning the plan unchanged would compile, ship, and change nothing
 * anybody could see: `PlanScreen`'s whole subtree is server-only, so the block would be carried and
 * never rendered, and the leak sweep in `page.test.tsx` would be the only thing that noticed. The
 * `?: never` is what turns that edit into a **compile error**, because `readonly PlanShareLink[]` is
 * assignable to nothing but itself. It is the `ProjectListItem = ProjectView.omit(...)` idea from
 * `packages/contracts/src/views.ts` with the hole closed, spelled here rather than there because the
 * omission is this *surface's* decision: the same `PlanView` must keep its seats for the phase 3
 * share manager that asks for them deliberately.
 *
 * It names **one** field, and that is the limit of what this can promise: a second privileged block
 * added to `PlanView` later would arrive on this surface unannounced.
 *
 * `app/(admin)/plans/[planId]/plan-page-model.ts` landed the same type for the admin half in this
 * phase, and closes exactly that gap by copying the plan **field by field** instead of stripping one
 * name, so a new field on `PlanView` fails to compile until somebody decides whether a page may carry
 * it. That is the better half of the two, and the two should become **one** module — in
 * `components/plan/` or `lib/`, since neither route segment may sensibly import the other's — with
 * this type and `seatless` deleted in favour of it. It is not done here because that means editing a
 * file another agent owns this phase. The alternative durable answer, should the projection ever want
 * a schema, is one omission declared beside the contract as
 * `PlanSeatView = PlanView.omit({ shareLinks: true })` (`packages/contracts/src/views.ts` does this
 * for `ProjectListItem`).
 */
export type SeatPlan = Omit<Plan, 'shareLinks'> & { readonly shareLinks?: never }

/** The plan a seat opens, or the sentence the API refused it with. */
export type SeatPlanRead = ActionResult<SeatPlan>

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

const holdsNoSeats = (plan: Plan): plan is SeatPlan => plan.shareLinks === undefined

const seatless = (plan: Plan): SeatPlan => {
  const { shareLinks, ...rest } = plan
  if (shareLinks !== undefined) return rest
  return holdsNoSeats(plan) ? plan : rest
}

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
 * deliberately. What the block is dropped *into* is {@link SeatPlan}, whose `shareLinks?: never`
 * makes "return it unchanged" a compile error rather than a silent regression only a test could
 * catch.
 *
 * The strip reads the block and hands back the rest; a caller the API refused it gets the very object
 * the API answered with, identity included, because a type predicate over the field is what narrows
 * that value rather than a rebuild — so an absent block cannot become a present-but-undefined one
 * under `exactOptionalPropertyTypes`. The predicate is a second look at the same field, and it earns
 * its place: a destructured `shareLinks` is a fresh binding, so checking it narrows the copy and not
 * the plan, and only a predicate over the plan itself lets that plan be returned as a {@link SeatPlan}.
 */
export const readSeatPlan = cache(async (token: string, planId: string): Promise<SeatPlanRead> => {
  const read = await linkRead(token, (api) => api.plans.read(planId))
  return read.ok ? { ok: true, value: seatless(read.value) } : read
})
