import type { RouteHandler } from '@hono/zod-openapi'
import type { EpicService } from '@repo/macroplan-domain'
import { planView } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createEpicRoute,
  deleteEpicRoute,
  placeEpicRoute,
  updateEpicRoute,
} from './routes.js'

/**
 * Adds a rail at the bottom of the plan and answers the whole plan.
 *
 * The target is `{ kind: 'epic' }` carrying the **validated** `planId` and no epic id, which is the
 * shape `Target` declares: a plan is shared at plan scope and nothing narrower exists (ADR 0053), so
 * no rule turns on an epic id and a field no rule reads is one that will one day be compared wrongly.
 * The gate is still the only thing standing between a seat on one plan and another, because the
 * product guard at the mount refuses the other product and not another plan inside this one.
 */
export const createEpic =
  (epics: EpicService): RouteHandler<typeof createEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const draft = c.req.valid('json')
    const principal = authorize(c, 'epic:create', { kind: 'epic', planId })
    const updated = await epics.add({ product: PRODUCT, planId }, draft)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Renames one rail, recolours it, or both, and answers the whole plan.
 *
 * One gate, because `UpdateEpicPayload` carries one authority: a rail's name and its colour are both
 * `epic:rename`, and there is no second action for a body that changes only the colour to ask for.
 * The payload declares no `binding`, so zod has already stripped one before this runs.
 */
export const updateEpic =
  (epics: EpicService): RouteHandler<typeof updateEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const principal = authorize(c, 'epic:rename', { kind: 'epic', planId })
    const updated = await epics.update({ product: PRODUCT, planId }, epicId, changes)
    return c.json(planView(updated, principal), 200)
  }

/** Moves one rail among its siblings, renumbering them densely, and answers the whole plan. */
export const placeEpic =
  (epics: EpicService): RouteHandler<typeof placeEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const { railOrder } = c.req.valid('json')
    const principal = authorize(c, 'epic:reorder', { kind: 'epic', planId })
    const updated = await epics.place({ product: PRODUCT, planId }, epicId, railOrder)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Removes one rail, its features and their items, and answers the plan that remains.
 *
 * The principal `authorize` returns is used, unlike `deletePlan` beside it: there is still a plan to
 * shape here, so the share block is decided per principal exactly as it is on a read.
 */
export const deleteEpic =
  (epics: EpicService): RouteHandler<typeof deleteEpicRoute, ApiEnv> =>
  async (c) => {
    const { planId, epicId } = c.req.valid('param')
    const principal = authorize(c, 'epic:delete', { kind: 'epic', planId })
    const updated = await epics.remove({ product: PRODUCT, planId }, epicId)
    return c.json(planView(updated, principal), 200)
  }
