import { createRoute } from '@hono/zod-openapi'
import { BoundTaskList, PlanBridgeView } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { epicParams, planParams } from '../params.js'

/**
 * What this plan's rails are bound to, and what each linked item's task counts — shaped for the caller.
 *
 * ### Why this is a second read and not part of `GET /plans/{planId}`
 *
 * `planView` is pure and synchronous and the whole domain package is built on that, where this answer
 * needs a manifest read per bound project in the *other* product. `LIMITS.epicsPerPlan` is 40, so
 * folding it in would put up to forty cross-product reads on the hot canvas path, and would make the
 * timeline itself wait on Microtask. Separating them means Microtask being unavailable degrades one
 * panel rather than the plan (ADR 0061).
 *
 * ### The gate, and why the shaping is not one
 *
 * `plan:read`, because this is a read of this plan. Every attenuation below that is *shaping*: the
 * epic block is admin-only and a linked task's name is withheld below effective `write`, both decided
 * inside `bridgeView`. A caller refused nothing still gets a 200 with less in it, which is what spec
 * §7.2 requires of a dead binding — "never an error page and never an empty canvas".
 */
export const readBridgeRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['bridge'],
  summary: 'What this plan is bound to, and what its linked tasks count',
  security: GUARDED_SECURITY,
  request: { params: planParams },
  responses: {
    200: {
      description: 'The plan’s bridge facts, shaped for whoever asked',
      content: { 'application/json': { schema: PlanBridgeView } },
    },
    ...problemResponses(),
  },
})

/**
 * Every task of one rail's bound project, id and name only — the list a picker chooses from.
 *
 * **Gated on `epic:bind`, which is admin-only, and that is the decision rather than a consequence.**
 * Spec §7.3 grants an effective `write` holder "the linked task's name" — one task, the one linked. A
 * list of up to `LIMITS.tasksPerProject` names is materially more than that, so offering it to a seat
 * would widen a plan credential into an inventory of somebody's Microtask project. Gating on the action
 * that already means "may administer this rail's binding" needs no new action to express it.
 *
 * The stated consequence, recorded rather than fixed: `PUT /items/{itemId}/link` is gated on
 * `item:link`, which §7.1 grants to `write`, so a write seat may link but has no picker to choose from.
 * Phase 1 decided that grant and a stored role cannot be re-decided. Closing it means deciding what a
 * seat may enumerate, which is a decision and not a detail.
 *
 * **409** for a rail bound to nothing or whose token no longer resolves, the same sentence the link
 * routes answer with.
 */
export const readBoundTasksRoute = createRoute({
  method: 'get',
  path: '/epics/{epicId}/tasks',
  tags: ['bridge'],
  summary: 'The tasks of one rail’s bound project',
  security: GUARDED_SECURITY,
  request: { params: epicParams },
  responses: {
    200: {
      description: 'The bound project’s tasks, id and name only',
      content: { 'application/json': { schema: BoundTaskList } },
    },
    ...problemResponses(),
  },
})
