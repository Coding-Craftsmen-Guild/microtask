import { OpenAPIHono } from '@hono/zod-openapi'
import {
  EpicService,
  FeatureService,
  ItemService,
  PlanService,
  type PlanContext,
} from '@repo/macroplan-domain'
import { AdminVerifier } from '../../auth/admin-verifier.js'
import type { ApiEnv } from '../../auth/env.js'
import { linkDirectories } from '../../auth/link-directory.js'
import { PrincipalResolver } from '../../auth/principal-resolver.js'
import { requirePrincipal } from '../../auth/require-principal.js'
import { requireProduct } from '../../auth/require-product.js'
import type { ApiDeps } from '../../deps.js'
import { createPlanScoped } from './plan-scoped.js'
import { createPlan, listPlans } from './plans/handlers.js'
import { createPlanRoute, listPlansRoute } from './plans/routes.js'
import { PRODUCT } from './product.js'
import type { PlanServices } from './services.js'

const resolverFor = (deps: ApiDeps): PrincipalResolver =>
  new PrincipalResolver({
    admin: new AdminVerifier({ config: deps.config, clock: deps.clock }),
    tokens: deps.tokens,
    directories: linkDirectories(deps.store, deps.plans),
  })

const contextFor = (deps: ApiDeps): PlanContext => ({
  store: deps.plans,
  lock: deps.lock,
  clock: deps.clock,
  ids: deps.ids,
  tokens: deps.tokens,
})

const servicesFor = (ctx: PlanContext): PlanServices => ({
  plans: new PlanService(ctx),
  epics: new EpicService(ctx),
  features: new FeatureService(ctx),
  items: new ItemService(ctx),
})

/**
 * Everything this product serves, behind its two guards.
 *
 * They are the first two statements after construction and nothing is mounted before them. A
 * `.use()` registered after the `.route()` or `.openapi()` it should protect never runs, and the
 * request still answers 200 — no warning, no failing route, only an open endpoint. Registering them
 * as `'*'` rather than per route is also what makes an unmatched path under this subtree answer 401
 * before 404, so a token cannot map the API by probing.
 *
 * `requirePrincipal` authenticates and does not authorize; the resolver it is given holds a
 * directory per product, so a Macroplan bearer resolves against `deps.plans` and a Microtask one
 * against `deps.store`. `requireProduct` then refuses a link rooted in the other product, because
 * one token index serves both and a Microtask bearer resolves to a real principal here. It is at the
 * mount rather than in a handler so that no route added to this subtree can forget it, and it is
 * **inside** this app rather than at the `/macroplan` prefix in `v1.ts` because a parent's `use()`
 * runs first and there would be no principal to read yet.
 *
 * **No handler below re-checks the scope's product**, and none needs a narrowing to do its work: a
 * plan route's target is built from its validated `planId`, never from the caller's own scope. What
 * neither guard decides is what a caller may reach *within* this product — a seat scoped to one plan
 * reaches every path here, and what stops it reading another plan is the `authorize` call in the
 * handler and nothing else.
 *
 * The two routes registered here rather than in the plan-scoped child are the ones with no plan in
 * their address, and ADR 0009 reserves both to the admin. The child is mounted at `/plans/:planId`,
 * a path neither of them has a value for.
 *
 * The `PlanContext` the services are built from is assembled here and nowhere else, because this is
 * the one seam that tells the two domains' stores apart: `deps.store` is Microtask's and `deps.plans`
 * is this product's, and everything below this function names ports only. It carries `tokens`
 * because `PlanService.remove` drops a deleted plan's seats from the index in the same locked write
 * that removes the plan — without it a deleted plan's tokens would keep resolving until a restart.
 * Its `lock`, `clock` and `ids` are the **same instances** Microtask's services hold: one
 * `QueueLock` for the whole process is deliberate (ADR 0006), since every write in this API is
 * already serial and a second lock would be a second place to get the ordering rules wrong.
 */
export function createMacroplan(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.use('*', requirePrincipal(resolverFor(deps), deps.config.serviceKeys))
  app.use('*', requireProduct(PRODUCT))
  const services = servicesFor(contextFor(deps))
  app.openapi(listPlansRoute, listPlans(services.plans))
  app.openapi(createPlanRoute, createPlan(services.plans))
  app.route('/plans/:planId', createPlanScoped(services))
  return app
}
