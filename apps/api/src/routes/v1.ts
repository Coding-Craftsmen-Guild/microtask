import { OpenAPIHono } from '@hono/zod-openapi'
import type { ApiEnv } from '../auth/env.js'
import type { ApiDeps } from '../deps.js'
import { createMicrotask } from './microtask/index.js'

/**
 * Version 1 of the API: one mount per product, and nothing of its own.
 *
 * The version lives in the path rather than in a header so that two versions can be served side
 * by side from one deployment, and so a stale client's requests are visible in a log rather than
 * silently reinterpreted.
 *
 * Typed `OpenAPIHono<ApiEnv>` like every other level. The generic does not travel through
 * `route()`, so a bare `OpenAPIHono` child mounted here compiles with no complaint and then every
 * `c.get('principal')` inside it is a type error — a failure that looks like the *child* being
 * wrong. Naming the env at every level is what keeps that from happening; nothing enforces it.
 */
export function createV1(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.route('/microtask', createMicrotask(deps))
  return app
}
