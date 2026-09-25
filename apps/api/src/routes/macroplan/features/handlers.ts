import type { RouteHandler } from '@hono/zod-openapi'
import type { FeatureService } from '@repo/macroplan-domain'
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

/**
 * Adds a feature to the end of a rail and answers the whole plan.
 *
 * It gates **per field**, exactly as {@link updateFeature} below does, and for the same reason:
 * `CreateFeaturePayload` carries a `pinSprint`, and a pin is `feature:pin`, which only `manage`
 * holds, where `feature:create` is a `write` action. One gate for the whole body would let a `write`
 * seat create a feature **already pinned to a sprint** and then be refused `pinFeature` on that same
 * feature a second later — the authority spec §7.1 reserves to the executive who owns the timeline,
 * reached through the one route that had not been asked to check it. Spec §3.1 calls a pin "the only
 * way a fixed point in time enters the model", which is what makes this the create route's business
 * rather than the edit route's alone.
 *
 * A `pinSprint` of `null` asks for nothing beyond `feature:create`, because `null` and an absent key
 * mean the same thing here — a feature with no pin — and refusing the explicit spelling of a state a
 * `write` seat may create by omission would be a refusal about JSON rather than about authority.
 *
 * The gap it closes was never opened by any UI: `create-controls.tsx` sends a rail and a name and
 * declines the field. So this is a hole in the API being closed rather than a change to the product,
 * and `features.test.ts` asserts it by seat — a `write` seat creating a pinned feature is refused, an
 * unpinned one is not.
 */
export const createFeature =
  (features: FeatureService): RouteHandler<typeof createFeatureRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const draft = c.req.valid('json')
    const principal = authorize(c, 'feature:create', { kind: 'feature', planId })
    if (draft.pinSprint !== undefined && draft.pinSprint !== null) {
      authorize(c, 'feature:pin', { kind: 'feature', planId })
    }
    const updated = await features.add({ product: PRODUCT, planId }, draft)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Renames, re-estimates or re-pins one feature, and answers the recomputed timeline.
 *
 * It asks for each action the body's **present** keys imply and never for one the body omitted, and
 * the three keys it accepts carry three authorities: a `name` needs `feature:rename`, an
 * `estimateDays` needs `feature:estimate` — both of them `write` — and a `pinSprint` needs
 * `feature:pin`, which only `manage` holds. A body carrying two or three of them meets each of
 * their gates in turn, so a `write` seat sending an estimate and a pin together is refused and
 * writes **neither**: every gate runs before `features.update` is reached, and the first refusal
 * throws.
 *
 * The pin is its own action rather than a second key under `feature:estimate`, because an estimate
 * says what the work costs and a pin says where the bar sits — which is exactly the line spec §7.1
 * draws between `write` and `manage`. It is not `feature:place` either: that moves a feature
 * along its rail or onto another, where a pin names the sprint before which it may not start. Every
 * authority in this policy is a named entry in the kernel's `ACTIONS` rather than folded into the
 * nearest neighbour that happens to share a role, and ADR 0053 records why this one had to be split
 * out: grouped under `feature:estimate` it was `write`-held, and a `write` seat could move a bar.
 *
 * With neither a `name` nor an `estimateDays` it asks `feature:pin`, which is the conservative
 * branch rather than a claim about the body: `UpdateFeaturePayload` refuses an empty object, and zod
 * strips unknown keys before that refinement runs, so a body reaching here with none of the three does
 * not exist. Were one to, it would meet the strongest of the three gates rather than be written
 * unguarded.
 */
export const updateFeature =
  (features: FeatureService): RouteHandler<typeof updateFeatureRoute, ApiEnv> =>
  async (c) => {
    const { planId, featureId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const renames = changes.name !== undefined
    const sizes = changes.estimateDays !== undefined
    const principal = renames
      ? authorize(c, 'feature:rename', { kind: 'feature', planId })
      : sizes
        ? authorize(c, 'feature:estimate', { kind: 'feature', planId })
        : authorize(c, 'feature:pin', { kind: 'feature', planId })
    if (renames && sizes) authorize(c, 'feature:estimate', { kind: 'feature', planId })
    if (changes.pinSprint !== undefined && (renames || sizes)) {
      authorize(c, 'feature:pin', { kind: 'feature', planId })
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
