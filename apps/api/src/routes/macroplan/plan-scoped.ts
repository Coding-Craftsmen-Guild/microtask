import { OpenAPIHono } from '@hono/zod-openapi'
import type { PlanService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../auth/env.js'
import { deletePlan, readPlan, updatePlan } from './plans/handlers.js'
import { deletePlanRoute, readPlanRoute, updatePlanRoute } from './plans/routes.js'

/**
 * The subtree addressed by one plan id.
 *
 * Mounted at `/plans/:planId` with a colon, because `route()` takes hono's path syntax while
 * `createRoute()` takes OpenAPI's braces. The brace form there 404s every route below while the
 * document still renders perfectly, which is a failure nothing but a live request detects.
 *
 * It is returned fully populated. A route added to a child after its parent has served is not an
 * error and not a warning — it is silently unreachable, and absent from the document besides — so
 * every route this subtree will ever have is registered before `createMacroplan` mounts it.
 *
 * It is handed the service rather than `ApiDeps`, because the `PlanContext` a Macroplan service is
 * built from is assembled once at the mount above: that is the one place the two domains' differing
 * `store` members are told apart, and nothing below here should have to know there are two.
 *
 * It carries **no guard of its own**. `createMacroplan` registers `requirePrincipal` and
 * `requireProduct` as `'*'` above this mount, and a parent's middleware runs for every path beneath
 * it, so a route added here is authenticated and product-checked the moment it exists. What it is
 * not is authorized: each handler still builds a target from its validated `planId` and calls
 * `authorize`, and that call is the only thing standing between a seat on one plan and another.
 */
export function createPlanScoped(plans: PlanService): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(readPlanRoute, readPlan(plans))
  app.openapi(updatePlanRoute, updatePlan(plans))
  app.openapi(deletePlanRoute, deletePlan(plans))
  return app
}
