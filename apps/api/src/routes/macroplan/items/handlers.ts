import type { RouteHandler } from '@hono/zod-openapi'
import type { ItemService, PlanService } from '@repo/macroplan-domain'
import { itemViewFor, planView } from '@repo/macroplan-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createItemRoute,
  deleteItemRoute,
  describeItemRoute,
  placeItemRoute,
  readItemRoute,
  updateItemRoute,
} from './routes.js'

/** Adds an item to the end of a feature and answers the plan, its feature's span already grown. */
export const createItem =
  (items: ItemService): RouteHandler<typeof createItemRoute, ApiEnv> =>
  async (c) => {
    const { planId } = c.req.valid('param')
    const draft = c.req.valid('json')
    const principal = authorize(c, 'item:create', { kind: 'item', planId })
    const updated = await items.add({ product: PRODUCT, planId }, draft)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Reads one item and the description its file holds.
 *
 * Gated on `plan:read` and not on an `item:` action, because reading an item is reading part of the
 * plan: there is no narrower scope a seat could hold (ADR 0053), and a second read action would be a
 * distinction no principal could be on either side of.
 *
 * **So every reader of the plan reaches this route, which is why the principal is spent rather than
 * discarded.** `itemViewFor` applies design §7.3's one shaping — an item's `linkedTaskId` is withheld from
 * a reader below an effective `write` on the rail above it — and until phase 4 wrote that field there was
 * nothing to withhold, so this handler dropped the principal and answered the item as stored. That went on
 * being true after the writer arrived: a plan `view` seat was refused the link in the timeline and handed
 * it here, which is one fact answered two ways by one API. The phase-4 gate was never breached — a task's
 * **name** is only ever read through the bridge, which attenuates on its own — but the weaker fact that a
 * link exists was, and `views/plan-view.ts` in `@repo/macroplan-domain` holds the argument in full.
 */
export const readItem =
  (items: ItemService): RouteHandler<typeof readItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const principal = authorize(c, 'plan:read', { kind: 'plan', planId })
    const found = await items.readOne({ product: PRODUCT, planId, itemId })
    return c.json(itemViewFor(found.plan, found.item, found.description, principal), 200)
  }

/**
 * Renames one item, re-estimates it, or both, and answers the recomputed timeline.
 *
 * It asks for each action the body's **present** keys imply and never for one the body omitted: a
 * `name` needs `item:rename` and an `estimateDays` needs `item:estimate`. Both sit under `write`
 * today, so the distinction buys nothing yet — it is declared because this pair is the obvious first
 * place a later role split would land.
 *
 * With no `name` it asks `item:estimate`, which is the conservative branch rather than a claim about
 * the body: `UpdateItemPayload` refuses an empty object and zod strips unknown keys before that
 * refinement runs, so a body reaching here with neither key does not exist.
 */
export const updateItem =
  (items: ItemService): RouteHandler<typeof updateItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const changes = c.req.valid('json')
    const principal =
      changes.name === undefined
        ? authorize(c, 'item:estimate', { kind: 'item', planId })
        : authorize(c, 'item:rename', { kind: 'item', planId })
    if (changes.name !== undefined && changes.estimateDays !== undefined) {
      authorize(c, 'item:estimate', { kind: 'item', planId })
    }
    const updated = await items.update({ product: PRODUCT, planId }, itemId, changes)
    return c.json(planView(updated, principal), 200)
  }

/** Moves one item inside its feature or under another, and answers the recomputed timeline. */
export const placeItem =
  (items: ItemService): RouteHandler<typeof placeItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const to = c.req.valid('json')
    const principal = authorize(c, 'item:place', { kind: 'item', planId })
    const updated = await items.place({ product: PRODUCT, planId }, itemId, to)
    return c.json(planView(updated, principal), 200)
  }

/**
 * Replaces one item's description and answers the whole plan.
 *
 * `writeDescription` answers the item rather than the manifest, because the description is what it
 * wrote; the plan is read back afterwards so this route can answer what every other mutating route
 * here answers. The read is outside the write's lock and is deliberately allowed to be: it can only
 * ever be fresher than the manifest that write produced, and a description moves no bar in any case.
 */
export const describeItem =
  (items: ItemService, plans: PlanService): RouteHandler<typeof describeItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const { description } = c.req.valid('json')
    const principal = authorize(c, 'item:describe', { kind: 'item', planId })
    await items.writeDescription({ product: PRODUCT, planId, itemId }, description)
    return c.json(planView(await plans.read({ product: PRODUCT, planId }), principal), 200)
  }

/** Removes one item and its file, and answers the plan with its feature's span already shrunk. */
export const deleteItem =
  (items: ItemService): RouteHandler<typeof deleteItemRoute, ApiEnv> =>
  async (c) => {
    const { planId, itemId } = c.req.valid('param')
    const principal = authorize(c, 'item:delete', { kind: 'item', planId })
    const updated = await items.remove({ product: PRODUCT, planId }, itemId)
    return c.json(planView(updated, principal), 200)
  }
