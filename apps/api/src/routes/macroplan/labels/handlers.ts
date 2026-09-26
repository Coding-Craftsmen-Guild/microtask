import type { RouteHandler } from '@hono/zod-openapi'
import type { LabelService } from '@repo/macroplan-domain'
import { planView } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { createLabelRoute, deleteLabelRoute, updateLabelRoute } from './routes.js'

/**
 * Adds a label to the plan and answers the whole plan.
 *
 * The target is `{ kind: 'label' }` carrying the **validated** `planId` and no label id, which is the
 * shape `Target` declares for every Macroplan kind: a plan is shared at plan scope and nothing
 * narrower exists (ADR 0053), so no rule turns on a label id and a field no rule reads is one that
 * will one day be compared wrongly. The gate is still the only thing standing between a seat on one
 * plan and another — the product guard at the mount refuses the other product, not another plan.
 */
export const createLabel =
  (labels: LabelService): RouteHandler<typeof createLabelRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const draft = c.req.valid('json')
    const principal = authorize(c, 'label:create', { kind: 'label', planId })
    const updated = await labels.add({ product: PRODUCT, planId }, draft)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Renames one label, recolours it, or both, and answers the whole plan.
 *
 * One gate, because `UpdateLabelPayload` carries one authority: a group's name and its colour are both
 * `label:rename`, and there is no second action for a body that changes only the colour to ask for.
 */
export const updateLabel =
  (labels: LabelService): RouteHandler<typeof updateLabelRoute, ApiEnv> =>
  async (c) => {
    const { planId, labelId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const principal = authorize(c, 'label:rename', { kind: 'label', planId })
    const updated = await labels.update({ product: PRODUCT, planId }, labelId, changes)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Removes one label, clears it off every feature that was in it, and answers the plan that remains.
 *
 * The principal `authorize` returns is used, as `deleteEpic` beside it uses its own: there is still a
 * plan to shape here, so the share block and the bridge are decided per principal exactly as on a read.
 */
export const deleteLabel =
  (labels: LabelService): RouteHandler<typeof deleteLabelRoute, ApiEnv> =>
  async (c) => {
    const { planId, labelId } = c.req.valid('param')
    const principal = authorize(c, 'label:delete', { kind: 'label', planId })
    const updated = await labels.remove({ product: PRODUCT, planId }, labelId)
    return c.json(planView(updated, principal), 200)
  }
