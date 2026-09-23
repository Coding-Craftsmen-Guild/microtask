import type { RouteHandler } from '@hono/zod-openapi'
import type { PlanChanges, PlanService } from '@repo/macroplan-domain'
import { planListItem } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { planBody } from '../plan-body.js'
import { PRODUCT } from '../product.js'
import type {
  createPlanRoute,
  deletePlanRoute,
  listPlansRoute,
  readPlanRoute,
  updatePlanRoute,
} from './routes.js'

const RETIMING = ['startDate', 'sprintLengthDays', 'timezone'] as const

const retimes = (changes: PlanChanges): boolean =>
  RETIMING.some((key) => changes[key] !== undefined)

/**
 * Lists every plan, each shaped for whoever asked.
 *
 * The gate asks about the workspace rather than about any one plan, which is the whole of ADR 0009:
 * a collection route has no per-resource target, and `workspace:list-plans` is admin-only, so a seat
 * holder is refused here rather than handed a filtered list.
 *
 * Shaped by `planListItem` and not `planBody`: the contents of 200 plans are not what a list screen
 * renders, and a list carrying every plan's live tokens is a credential dump to a caller with no use
 * for one of them. The `shareLinkCount` it carries instead is gated on the same `share:read`
 * decision the block would have been, so a caller refused the seats is refused their number too.
 */
export const listPlans =
  (plans: PlanService): RouteHandler<typeof listPlansRoute, ApiEnv> =>
  async (c) => {
    const principal = authorize(c, 'workspace:list-plans', { kind: 'workspace' })
    const manifests = await plans.list(PRODUCT)
    return c.json({ plans: manifests.map((one) => planListItem(one, principal)) }, 200)
  }

/**
 * Creates an empty plan and answers 201.
 *
 * The status is the numeric `201` and never the string `'201'`: a string status is silently ignored
 * and the response goes out as 200, with no runtime guard anywhere to catch it.
 *
 * The body is the plan as stored plus the schedule of an empty timeline — no epics, so no spans.
 * Nothing about that schedule is written to the manifest; the view derives it on every read.
 */
export const createPlan =
  (plans: PlanService): RouteHandler<typeof createPlanRoute, ApiEnv> =>
  async (c) => {
    const settings = c.req.valid('json')
    const principal = authorize(c, 'workspace:create-plan', { kind: 'workspace' })
    const created = await plans.create(PRODUCT, settings)
    return c.json(planBody(created, principal), 201)
  }

/**
 * Reads one plan and the schedule derived from it.
 *
 * The `planId` is the **validated** path parameter and never the caller's own scope, so the path
 * decides what is being asked about and the gate decides whether this caller may ask. A seat scoped
 * to another plan reaches this route and is refused by that call — the product guard at the mount
 * refuses only the other product, not another plan inside this one.
 */
export const readPlan =
  (plans: PlanService): RouteHandler<typeof readPlanRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const principal = authorize(c, 'plan:read', { kind: 'plan', planId })
    const found = await plans.read({ product: PRODUCT, planId })
    return c.json(planBody(found, principal), 200)
  }

/**
 * Renames one plan, retimes it, or both, and answers with the recomputed timeline.
 *
 * It asks for each action the body's **present** keys imply and never for one the body omitted: a
 * `name` needs `plan:rename`, and a `startDate`, `sprintLengthDays` or `timezone` needs
 * `plan:retime`. Both sit under `manage` today, so the distinction buys nothing yet — it is declared
 * because this pair is the obvious first place a later role split would land, and a handler that
 * authorizes on the union of what its body actually touches cannot be wrong later.
 *
 * With no `name` it asks `plan:retime`, which is the conservative branch rather than a claim about
 * the body: `UpdatePlanPayload` refuses an empty object, and zod strips unknown keys before that
 * refinement runs, so a body reaching here with neither a name nor a timing field does not exist.
 * Were one to, it would be refused rather than written unguarded.
 */
export const updatePlan =
  (plans: PlanService): RouteHandler<typeof updatePlanRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const principal =
      changes.name === undefined
        ? authorize(c, 'plan:retime', { kind: 'plan', planId })
        : authorize(c, 'plan:rename', { kind: 'plan', planId })
    if (changes.name !== undefined && retimes(changes)) {
      authorize(c, 'plan:retime', { kind: 'plan', planId })
    }
    const updated = await plans.update({ product: PRODUCT, planId }, changes)
    return c.json(planBody(updated, principal), 200)
  }

/**
 * Removes one plan and answers 204 with no body.
 *
 * `authorize` is called for its refusal, not for the principal it returns: there is nothing left to
 * shape per principal once the plan is gone. The service drops the plan's seats from the token index
 * in the same locked write, so a revoked seat cannot outlive the plan it pointed at.
 */
export const deletePlan =
  (plans: PlanService): RouteHandler<typeof deletePlanRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    authorize(c, 'plan:delete', { kind: 'plan', planId })
    await plans.remove({ product: PRODUCT, planId })
    return c.body(null, 204)
  }
