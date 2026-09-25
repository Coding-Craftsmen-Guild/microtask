import { OpenAPIHono } from '@hono/zod-openapi'
import type { ItemService, PlanService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { BridgeService } from '../../../bridge/bridge-service.js'
import {
  createItem,
  deleteItem,
  describeItem,
  placeItem,
  readItem,
  updateItem,
} from './handlers.js'
import { createTaskForItem, linkItem, unlinkItem } from './link-handlers.js'
import {
  createItemRoute,
  createTaskForItemRoute,
  deleteItemRoute,
  describeItemRoute,
  linkItemRoute,
  placeItemRoute,
  readItemRoute,
  unlinkItemRoute,
  updateItemRoute,
} from './routes.js'

/**
 * The items of one plan, mounted under `/items`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and populated in
 * full before its parent mounts it: a route added to a child after the parent has served is silently
 * unreachable rather than an error, and absent from the document besides.
 *
 * Two services, because one route here answers something `ItemService` cannot produce:
 * `writeDescription` returns the item it wrote, and the description route has to answer the plan like
 * every other mutating route in this subtree. Neither service is constructed here — both arrive from
 * the single `PlanContext` assembled at the product root.
 */
export function createItems(
  items: ItemService,
  plans: PlanService,
  bridge: BridgeService,
): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(createItemRoute, createItem(items))
  app.openapi(placeItemRoute, placeItem(items))
  app.openapi(describeItemRoute, describeItem(items, plans))
  app.openapi(readItemRoute, readItem(items))
  app.openapi(updateItemRoute, updateItem(items))
  app.openapi(deleteItemRoute, deleteItem(items))
  app.openapi(linkItemRoute, linkItem(items, plans, bridge))
  app.openapi(unlinkItemRoute, unlinkItem(items))
  app.openapi(createTaskForItemRoute, createTaskForItem(items, plans, bridge))
  return app
}
