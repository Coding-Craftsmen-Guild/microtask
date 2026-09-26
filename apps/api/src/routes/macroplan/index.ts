import { OpenAPIHono } from '@hono/zod-openapi'
import {
  EpicService,
  FeatureService,
  ItemService,
  LabelService,
  PlanService,
  PlanShareLinkService,
  type PlanContext,
} from '@repo/macroplan-domain'
import { TaskService } from '@repo/microtask-domain'
import { AdminVerifier } from '../../auth/admin-verifier.js'
import type { ApiEnv } from '../../auth/env.js'
import { linkDirectories } from '../../auth/link-directory.js'
import { PrincipalResolver } from '../../auth/principal-resolver.js'
import { requirePrincipal } from '../../auth/require-principal.js'
import { requireProduct } from '../../auth/require-product.js'
import { BridgeService } from '../../bridge/bridge-service.js'
import { Bindings } from '../../bridge/bindings.js'
import type { ApiDeps } from '../../deps.js'
import { createPlanScoped } from './plan-scoped.js'
import { createPlan, listPlans } from './plans/handlers.js'
import { createPlanRoute, listPlansRoute } from './plans/routes.js'
import { PRODUCT } from './product.js'
import type { PlanServices } from './services.js'
import { readCurrentPlanShare } from './shares/handlers.js'
import { currentPlanShareRoute } from './shares/routes.js'

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

/**
 * The two collaborators that reach Microtask, built here because here is where both stores are in scope.
 *
 * `deps.store` is Microtask's and `deps.plans` is this product's, and this function is the only place in
 * the Macroplan tree that sees both. The resolver handed to each is the **same instance** the guards
 * above use, so a bound token and a request bearer are resolved by one code path — two resolvers would
 * be two places a revocation could fail to take effect.
 */
export const bridgeFor = (deps: ApiDeps, resolver: PrincipalResolver): Pick<PlanServices, 'bridge' | 'bindings'> => ({
  bridge: new BridgeService({
    secret: deps.config.bridgeSecret,
    bearers: resolver,
    store: deps.store,
    tasks: new TaskService(deps),
  }),
  bindings: new Bindings({ secret: deps.config.bridgeSecret, bearers: resolver }),
})

const servicesFor = (ctx: PlanContext, bridge: Pick<PlanServices, 'bridge' | 'bindings'>): PlanServices => ({
  plans: new PlanService(ctx),
  epics: new EpicService(ctx),
  labels: new LabelService(ctx),
  features: new FeatureService(ctx),
  items: new ItemService(ctx),
  seats: new PlanShareLinkService(ctx),
  ...bridge,
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
 * **No handler below re-checks the scope's product.** Every plan route builds its target from its
 * validated `planId`, so none of them needs a narrowing either. The exception is `/shares/current`,
 * whose whole subject is the caller's own credential: it has no path to read a plan from, so it
 * narrows the scope to a plan-rooted one — a **checked** narrowing and not a cast, because a
 * middleware refusal is invisible to the compiler and `scope.planId` needs the narrower type. What
 * neither guard decides is what a caller may reach *within* this product — a seat scoped to one plan
 * reaches every path here, and what stops it reading another plan is the `authorize` call in the
 * handler and nothing else.
 *
 * The three routes registered here rather than in the plan-scoped child are the ones with no plan in
 * their address. ADR 0009 reserves the two collections to the admin; the third is the opposite, the
 * bootstrap a seat holder calls about itself, which an admin is answered 404 for because an admin
 * credential names no seat. The child is mounted at `/plans/:planId`, a path none of the three has a
 * value for.
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
  const resolver = resolverFor(deps)
  app.use('*', requirePrincipal(resolver, deps.config.serviceKeys))
  app.use('*', requireProduct(PRODUCT))
  const services = servicesFor(contextFor(deps), bridgeFor(deps, resolver))
  app.openapi(listPlansRoute, listPlans(services.plans))
  app.openapi(createPlanRoute, createPlan(services.plans))
  app.openapi(currentPlanShareRoute, readCurrentPlanShare(services.plans))
  app.route('/plans/:planId', createPlanScoped(services))
  return app
}
