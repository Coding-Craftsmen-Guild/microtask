import { PlanView } from '@repo/contracts'

/**
 * The 200 every structural edit answers with: the whole plan, schedule included.
 *
 * Shared by the fourteen **structural** routes under `/plans/{planId}/{epics,features,items}` rather
 * than written out per route, because the answer really is the same on every one of them — the plan as
 * it now stands — and one copy of that sentence per route would be that many places for it to drift
 * from the schema beside it.
 *
 * It is a `const` and not a function returning one, so the schema type survives into `createRoute`:
 * `RouteHandler` derives what `c.json(…, 200)` accepts from this object's inferred type, and a
 * helper that widened `schema` to `unknown` would take any body at all.
 *
 * Why the whole plan, on a `POST` no less than on a `DELETE`: every structural edit can move every
 * bar on the canvas — a new item grows its feature's span, which pushes everything after it on that
 * rail and everything waiting on it across rails — so a response carrying only the changed entity
 * would leave the client to re-derive the timeline or fetch it again. Phase 3's optimistic drag
 * needs the authoritative answer in the same round trip.
 *
 * That is why the routes that do **not** share this are the ones whose body is a thing rather than a
 * timeline, and there are three of them: `POST /plans` answers 201 with the plan it created,
 * `DELETE /plans/{planId}` answers 204 because a plan that is gone has no representation, and
 * `DELETE /plans/{planId}/share-links/{token}` answers 204 because revoking a seat moves no bar on the
 * canvas. `PATCH /plans/{planId}` and the two share-link routes that answer a body declare it
 * themselves — `PlanView` on the first, `PlanShareLink` on the other two. So this constant is the rule
 * for structural edits and not for every mutating route under the plan's path.
 */
export const PLAN_RESPONSE = {
  description: 'The plan as it now stands, with the schedule derived from it',
  content: { 'application/json': { schema: PlanView } },
}
