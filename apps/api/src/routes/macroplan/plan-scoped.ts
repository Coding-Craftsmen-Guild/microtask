import { OpenAPIHono } from '@hono/zod-openapi'
import type { ApiEnv } from '../../auth/env.js'
import { createBridge } from './bridge/app.js'
import { createEpics } from './epics/app.js'
import { createFeatures } from './features/app.js'
import { createItems } from './items/app.js'
import { createLabels } from './labels/app.js'
import { createPlanShareLinks } from './share-links/app.js'
import { deletePlan, readPlan, updatePlan } from './plans/handlers.js'
import { deletePlanRoute, readPlanRoute, updatePlanRoute } from './plans/routes.js'
import type { PlanServices } from './services.js'

/**
 * The subtree addressed by one plan id.
 *
 * Mounted at `/plans/:planId` with a colon, because `route()` takes hono's path syntax while
 * `createRoute()` takes OpenAPI's braces. The brace form there 404s every route below while the
 * document still renders perfectly, which is a failure nothing but a live request detects.
 *
 * It is returned fully populated. A route added to a child after its parent has served is not an
 * error and not a warning — it is silently unreachable, and absent from the document besides — so
 * every route this subtree will ever have is registered before `createMacroplan` mounts it. That
 * applies to the children below as well: each is complete when it arrives.
 *
 * It is handed the services rather than `ApiDeps`, because the `PlanContext` a Macroplan service is
 * built from is assembled once at the mount above: that is the one place the two domains' differing
 * `store` members are told apart, and nothing below here should have to know there are two. The
 * record it takes rather than a parameter per service is what keeps that property affordable as the
 * subtree grows — and each child receives only the services its own routes call.
 *
 * It carries **no guard of its own**. `createMacroplan` registers `requirePrincipal` and
 * `requireProduct` as `'*'` above this mount, and a parent's middleware runs for every path beneath
 * it, so a route added here is authenticated and product-checked the moment it exists. What it is
 * not is authorized: each handler still builds a target from its validated `planId` and calls
 * `authorize`, and that call is the only thing standing between a seat on one plan and another.
 */
export function createPlanScoped(services: PlanServices): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(readPlanRoute, readPlan(services.plans))
  app.openapi(updatePlanRoute, updatePlan(services.plans))
  app.openapi(deletePlanRoute, deletePlan(services.plans))
  app.route('/epics', createEpics(services.epics, services.bindings))
  app.route('/labels', createLabels(services.labels))
  app.route('/features', createFeatures(services.features))
  app.route('/items', createItems(services.items, services.plans, services.bridge))
  app.route('/share-links', createPlanShareLinks(services.seats))
  app.route('/bridge', createBridge(services.plans, services.bridge))
  return app
}
