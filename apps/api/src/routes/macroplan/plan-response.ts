import { PlanView } from '@repo/contracts'

/**
 * The 200 every structural edit answers with: the whole plan, schedule included.
 *
 * Shared by all fourteen mutating routes under `/plans/{planId}` rather than written out per route,
 * because the answer really is the same on every one of them — the plan as it now stands — and
 * fourteen copies of that sentence would be fourteen places for it to drift from the schema beside
 * it.
 *
 * It is a `const` and not a function returning one, so the schema type survives into `createRoute`:
 * `RouteHandler` derives what `c.json(…, 200)` accepts from this object's inferred type, and a
 * helper that widened `schema` to `unknown` would take any body at all.
 *
 * Why the whole plan, on a `POST` no less than on a `DELETE`: every structural edit can move every
 * bar on the canvas — a new item grows its feature's span, which pushes everything after it on that
 * rail and everything waiting on it across rails — so a response carrying only the changed entity
 * would leave the client to re-derive the timeline or fetch it again. Phase 3's optimistic drag
 * needs the authoritative answer in the same round trip. That is why this subtree departs from the
 * plan routes beside it, where `POST /plans` answers 201 and `DELETE` answers 204: there the body is
 * the created or deleted thing, and here it is always the plan.
 */
export const PLAN_RESPONSE = {
  description: 'The plan as it now stands, with the schedule derived from it',
  content: { 'application/json': { schema: PlanView } },
}
