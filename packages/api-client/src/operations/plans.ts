import {
  ItemView,
  PlanList,
  PlanView,
  type CreatePlanPayload,
  type UpdatePlanPayload,
} from '@repo/contracts'
import { MACROPLAN_PLANS_PATH, planItemPath, planPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded } from '../types.js'

/**
 * One plan and the schedule derived from it, with blocks this caller is refused absent.
 *
 * It is what nearly every Macroplan **write** answers too, not only the reads, and that is the one
 * thing about this client a reader has to know before using any of it: a structural edit can move
 * every bar on the canvas — a feature's span is the sum of its items, so growing one pushes
 * everything after it on its rail and everything waiting on it across rails — and retiming a plan
 * moves every date at once. So the authoritative timeline arrives in the same round trip as the
 * write, and phase 3's optimistic drag has something to reconcile against instead of a second fetch
 * to make. `apps/api/src/routes/macroplan/plan-response.ts` is where that rule lives and where its
 * exceptions are named; every member of this module and of the epic, feature and item modules points
 * here rather than restating it, because one fact written five times is five chances for one copy to
 * go stale.
 *
 * `transport.empty` and a `Promise<void>` would compile on any of those members and silently throw
 * the timeline away, so the declared return type is the only thing holding the difference.
 */
export type Plan = Decoded<typeof PlanView>

/**
 * The plan to create: its name, its start date, and optionally the calendar it is drawn on.
 *
 * `sprintLengthDays` and `timezone` are optional because `PlanService` decides a default for each,
 * and the schema deliberately declares none — so a caller that omits them gets the product's
 * default rather than a value this package guessed at and could drift from.
 */
export type NewPlan = Decoded<typeof CreatePlanPayload>

/**
 * What may be changed about a plan that already exists: its name, its calendar, or both.
 *
 * Every field optional and **none nullable**: a name, a start date, a sprint length and a timezone
 * are always replaced and never cleared, so none of them has a `null` spelling to mean "unset" — the
 * distinction `features.ts` and `items.ts` both have to draw on an estimate.
 *
 * The API refuses an empty body, so a call asking for nothing is a 422 rather than a write that
 * stamps `updatedAt` and changes nothing.
 */
export type PlanChange = Decoded<typeof UpdatePlanPayload>

/** Every read a plan needs, and the three writes that are about the plan rather than its contents. */
export interface PlansApi {
  /** Lists every plan the caller may be told about. `workspace:list-plans` is admin-only. */
  list(): Promise<Decoded<typeof PlanList>>

  /** Reads one plan: its rails, its features, its items, and the schedule derived from all three. */
  read(planId: string): Promise<Plan>

  /** Reads one item with the description its own file holds. */
  readItem(planId: string, itemId: string): Promise<Decoded<typeof ItemView>>

  /**
   * Creates an empty plan, and is the one call on this surface **no seat can ever make**.
   *
   * It breaks the pattern the rail, feature and item writes set in two ways. It takes no `planId`,
   * because it is addressed at the collection and the plan it answers with is the first place that id
   * exists. And it is gated on the **workspace** rather than on a plan: `workspace:create-plan` is
   * admin-only in the kernel's policy, so a `manage` seat — which may rename, retime and delete the
   * plan it holds — is refused this with a 403. A UI offering it to a seat holder is offering a button
   * that cannot work.
   *
   * It answers **201**, where every other write here answers 200. The body is still {@link Plan}: the
   * plan as stored plus the schedule of an empty timeline, which has no rails and so no spans.
   */
  create(plan: NewPlan): Promise<Plan>

  /**
   * Renames one plan, retimes it, or both, leaving everything on its rails where it was.
   *
   * It moves every bar without touching a single one of them, which is what makes it unlike the
   * structural writes: the schedule is derived from `startDate` and `sprintLengthDays`, so shifting
   * the origin shifts every derived date and every sprint boundary at once. Nothing is restructured
   * and the whole timeline is different, so it answers {@link Plan} for the same reason they do —
   * and it is the one route under a plan that declares that response on itself rather than sharing
   * the structural routes' constant.
   *
   * **A body carrying both a name and a timing field is authorised against two gates**, as the
   * feature route is: a `name` needs `plan:rename`, and a `startDate`, `sprintLengthDays` or
   * `timezone` needs `plan:retime`. Both sit at `manage` today, so nothing can half-refuse yet — the
   * split is declared where a later role split would land, not as a bar to clear twice.
   */
  update(planId: string, change: PlanChange): Promise<Plan>

  /**
   * Removes one plan, everything on its rails, and every seat that pointed at it.
   *
   * The one delete in this product that answers **`void`**, and the reason `transport.empty` is
   * reachable from this surface at all: a plan that is gone has no representation, so there is no
   * timeline left for a response to carry. `shareLinks.revoke` is the only other Macroplan call that
   * answers nothing, and for the same kind of reason rather than by coincidence — what it removed
   * leaves nothing behind to send.
   *
   * A caller holding the plan it just deleted therefore holds a {@link Plan} that no longer describes
   * anything, and no answer here tells it so. Dropping that value is the caller's job.
   */
  remove(planId: string): Promise<void>
}

/** Binds the plan operations to a transport. */
export function plansApi(transport: Transport): PlansApi {
  return {
    list: () => transport.json({ method: 'GET', path: MACROPLAN_PLANS_PATH }, PlanList),
    read: (planId) => transport.json({ method: 'GET', path: planPath(planId) }, PlanView),
    readItem: (planId, itemId) =>
      transport.json({ method: 'GET', path: planItemPath(planId, itemId) }, ItemView),
    create: (plan) =>
      transport.json({ method: 'POST', path: MACROPLAN_PLANS_PATH, body: plan }, PlanView),
    update: (planId, change) =>
      transport.json({ method: 'PATCH', path: planPath(planId), body: change }, PlanView),
    remove: (planId) => transport.empty({ method: 'DELETE', path: planPath(planId) }),
  }
}
