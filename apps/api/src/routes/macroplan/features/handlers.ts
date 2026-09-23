import type { RouteHandler } from '@hono/zod-openapi'
import type { FeatureChanges, FeatureService } from '@repo/macroplan-domain'
import { planView } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createFeatureRoute,
  deleteFeatureRoute,
  placeFeatureRoute,
  setDependenciesRoute,
  updateFeatureRoute,
} from './routes.js'

const SIZING = ['estimateDays', 'pinSprint'] as const

const sizes = (changes: FeatureChanges): boolean =>
  SIZING.some((key) => changes[key] !== undefined)

/** Adds a feature to the end of a rail and answers the whole plan. */
export const createFeature =
  (features: FeatureService): RouteHandler<typeof createFeatureRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const draft = c.req.valid('json')
    const principal = authorize(c, 'feature:create', { kind: 'feature', planId })
    const updated = await features.add({ product: PRODUCT, planId }, draft)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Renames, re-estimates or re-pins one feature, and answers the recomputed timeline.
 *
 * It asks for each action the body's **present** keys imply and never for one the body omitted: a
 * `name` needs `feature:rename`, and an `estimateDays` or a `pinSprint` needs `feature:estimate`.
 * Both sit under `write` today, so the distinction buys nothing yet — it is declared because this
 * pair is the obvious first place a later role split would land, and a handler that authorizes on the
 * union of what its body actually touches cannot be wrong later.
 *
 * `pinSprint` is grouped with the estimate rather than with `feature:place`, because both decide when
 * the bar is drawn where `feature:place` decides which rail it is drawn on — and because this route
 * carries exactly the two authorities the plan's table gives it.
 *
 * With no `name` it asks `feature:estimate`, which is the conservative branch rather than a claim
 * about the body: `UpdateFeaturePayload` refuses an empty object, and zod strips unknown keys before
 * that refinement runs, so a body reaching here with none of the three does not exist. Were one to,
 * it would be refused rather than written unguarded.
 */
export const updateFeature =
  (features: FeatureService): RouteHandler<typeof updateFeatureRoute, ApiEnv> =>
  async (c) => {
    const { planId, featureId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const principal =
      changes.name === undefined
        ? authorize(c, 'feature:estimate', { kind: 'feature', planId })
        : authorize(c, 'feature:rename', { kind: 'feature', planId })
    if (changes.name !== undefined && sizes(changes)) {
      authorize(c, 'feature:estimate', { kind: 'feature', planId })
    }
    const updated = await features.update({ product: PRODUCT, planId }, featureId, changes)
    return c.json(planView(updated, principal), 200)
  }

/** Moves one feature along its rail or onto another, and answers the recomputed timeline. */
export const placeFeature =
  (features: FeatureService): RouteHandler<typeof placeFeatureRoute, ApiEnv> =>
  async (c) => {
    const { planId, featureId } = c.req.valid('param')
    const to = c.req.valid('json')
    const principal = authorize(c, 'feature:place', { kind: 'feature', planId })
    const updated = await features.place({ product: PRODUCT, planId }, featureId, to)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Replaces what one feature waits on, and answers the recomputed timeline.
 *
 * The service refuses a cycle, a stranger and a budget overrun before its first store call, so each
 * of those refusals leaves the plan untouched — there is no partially written edge list to undo.
 */
export const setDependencies =
  (features: FeatureService): RouteHandler<typeof setDependenciesRoute, ApiEnv> =>
  async (c) => {
    const { planId, featureId } = c.req.valid('param')
    const { dependsOn } = c.req.valid('json')
    const principal = authorize(c, 'feature:depend', { kind: 'feature', planId })
    const at = { product: PRODUCT, planId }
    const updated = await features.setDependencies(at, featureId, dependsOn)
    return c.json(planView(updated, principal), 200)
  }

/** Removes one feature, its items and every edge naming it, and answers the plan that remains. */
export const deleteFeature =
  (features: FeatureService): RouteHandler<typeof deleteFeatureRoute, ApiEnv> =>
  async (c) => {
    const { planId, featureId } = c.req.valid('param')
    const principal = authorize(c, 'feature:delete', { kind: 'feature', planId })
    const updated = await features.remove({ product: PRODUCT, planId }, featureId)
    return c.json(planView(updated, principal), 200)
  }
