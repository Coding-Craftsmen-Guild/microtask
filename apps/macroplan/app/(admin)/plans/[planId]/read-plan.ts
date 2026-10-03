import { cache } from 'react'
import { adminRead, type ActionResult } from '../../../../actions/result'
import {
  planScreenModel,
  type PlanScreenModel,
} from '../../../../components/plan/plan-screen-model'
import { planPath } from '../../../../lib/routes'

/**
 * What every surface under `[planId]` renders from: the plan minus its seats, or the sentence it was
 * refused with.
 */
export type PlanRead = ActionResult<PlanScreenModel>

/**
 * Reads one plan — its rails, its features, its items and the schedule derived from all three —
 * once per request.
 *
 * `cache` is what lets **every caller under this segment** share a single request rather than make
 * two or three of the largest response in the product, and it is keyed on `planId`, so a page reading
 * two plans would still make two calls. This is the idiom
 * `apps/microtask/app/s/[token]/read-share.ts` and `components/projects/load.ts` both establish.
 *
 * There are two callers and no page among them: `layout.tsx`, which hands the plan to the browser, and its
 * `generateMetadata`, which titles the tab with the plan's name — one call between them. The drawer pages
 * were two more, each resolving its own subject out of the same plan; the drawer is drawn in the browser
 * from the plan the layout handed over now, and every page under the segment reads nothing (ADR 0069).
 * Which holds only while both callers ask with the same key, which is why neither threads its own
 * pathname in.
 *
 * {@link adminRead} rather than `adminCall`, so `missingIsNotFound` applies: a plan the API does not
 * hold is a **404**, and an id that is not a ULID is a **422** — the API validates `planId` as an
 * `EntityId` in `apps/api/src/routes/macroplan/params.ts`, so the validator refuses it before any
 * lookup — and both reach a not-found page rather than a sentence in place of a timeline. A segment's
 * own boundary renders **inside** its layout, so the layout's `notFound()` escapes this directory to
 * `app/(admin)/plans/not-found.tsx`; a feature or an item that is gone is the drawer's to say, in the
 * browser. A hand-typed URL produces the 422, which is why it is in that set and why a page using `adminCall` here would show
 * "Macroplan could not complete that" for a typo.
 *
 * Every other refusal comes back for the caller to say: a 403 is a real answer about authority, and an
 * unreachable API is not a missing plan. An expired session redirects to `/login?next=` from inside
 * `adminCall`, carrying **the plan's** own path — `planPath(planId)`, never the drawer's — so the
 * admin lands back on the plan they were reading.
 *
 * **The plan's seats are dropped here, on the server**, by {@link planScreenModel} — the one
 * reduction both plan surfaces make, which lives beside the component whose prop type it is. The
 * reduction is this function's rather than any caller's so that neither of the two above is ever handed
 * a token it could pass on. `plans.read()` really does answer an admin with every live token on the plan, which
 * `packages/macroplan-domain/src/views/view-leaks.test.ts` requires of the view rather than leaves to
 * inference, and ADR 0033 forbids rendering that block into a page whoever is reading. The return
 * type is {@link PlanScreenModel} and not `Plan`, so a future edit that handed the plan over
 * unreduced is a compile error and not merely a leak sweep away from shipping — and `PlanApp`, the one
 * component the plan crosses into the browser through, takes that same type, so it refuses a plan
 * carrying the block.
 */
export const readPlan = cache(async (planId: string): Promise<PlanRead> => {
  const read = await adminRead(planPath(planId), (api) => api.plans.read(planId))
  return read.ok ? { ok: true, value: planScreenModel(read.value) } : read
})
