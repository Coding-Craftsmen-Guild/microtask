import { OpenAPIHono } from '@hono/zod-openapi'
import type { EpicService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../../auth/env.js'
import { createEpic, deleteEpic, placeEpic, updateEpic } from './handlers.js'
import { createEpicRoute, deleteEpicRoute, placeEpicRoute, updateEpicRoute } from './routes.js'

/**
 * The rails of one plan, mounted under `/epics`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and populated in
 * full before its parent mounts it: a route added to a child after the parent has served is silently
 * unreachable rather than an error, and absent from the document besides.
 *
 * It carries no guard of its own. `createMacroplan` registers `requirePrincipal` and `requireProduct`
 * as `'*'` two mounts above, and a parent's middleware runs for every path beneath it. What each
 * handler still does is build a target from its validated `planId` and call `authorize`.
 *
 * `/{epicId}/placement` is registered ahead of `/{epicId}` although neither could match the other's
 * path — one is two segments and the other is one — so the order is legibility rather than routing.
 */
export function createEpics(epics: EpicService): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(createEpicRoute, createEpic(epics))
  app.openapi(placeEpicRoute, placeEpic(epics))
  app.openapi(updateEpicRoute, updateEpic(epics))
  app.openapi(deleteEpicRoute, deleteEpic(epics))
  return app
}
