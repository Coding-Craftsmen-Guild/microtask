import { OpenAPIHono } from '@hono/zod-openapi'
import type { PlanShareLinkService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../../auth/env.js'
import { createPlanShareLink, revokePlanShareLink, updatePlanShareLink } from './handlers.js'
import {
  createPlanShareLinkRoute,
  revokePlanShareLinkRoute,
  updatePlanShareLinkRoute,
} from './routes.js'

/**
 * The seats one plan hands out, mounted under `/share-links`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and populated in
 * full before its parent mounts it: a route added to a child after the parent has served is silently
 * unreachable rather than an error, and absent from the document besides.
 *
 * It carries no guard of its own. `createMacroplan` registers `requirePrincipal` and `requireProduct`
 * as `'*'` two mounts above, and a parent's middleware runs for every path beneath it. What each
 * handler still does is build a target from its validated `planId` and call `authorize` — and on
 * these three routes that call is the whole boundary between a `write` seat and a `manage` one,
 * which is the most dangerous place in the product for one to be missing (spec §10).
 *
 * A seat's name and role are changeable in place and its scope is not — there being no scope on a
 * plan seat to change. Where Microtask freezes one because a project scope can span clients
 * (ADR 0011), here the field does not exist, so the two products reach the same rule from opposite
 * directions and neither route can widen a seat in place.
 */
export function createPlanShareLinks(seats: PlanShareLinkService): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(createPlanShareLinkRoute, createPlanShareLink(seats))
  app.openapi(updatePlanShareLinkRoute, updatePlanShareLink(seats))
  app.openapi(revokePlanShareLinkRoute, revokePlanShareLink(seats))
  return app
}
