import { OpenAPIHono } from '@hono/zod-openapi'
import { ShareLinkService } from '@repo/microtask-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { createShareLink, listShareLinks, revokeShareLink, updateShareLink } from './handlers.js'
import {
  createShareLinkRoute,
  listShareLinksRoute,
  revokeShareLinkRoute,
  updateShareLinkRoute,
} from './routes.js'

/**
 * The seats one project hands out, mounted under `/share-links`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and
 * returned fully populated: a route added to a child after its parent has served is silently
 * unreachable rather than an error.
 *
 * A link's name and role are changeable in place and its **scope** is not, matching the service:
 * a mutable scope would let a `manage` holder widen its own authority in place, so changing one
 * is revoke-and-reissue (ADR 0011). The PATCH body is closed to `name` and `role` for that
 * reason (ADR 0035).
 */
export function createShareLinks(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const links = new ShareLinkService(deps)
  app.openapi(listShareLinksRoute, listShareLinks(links))
  app.openapi(createShareLinkRoute, createShareLink(links))
  app.openapi(updateShareLinkRoute, updateShareLink(links))
  app.openapi(revokeShareLinkRoute, revokeShareLink(links))
  return app
}
