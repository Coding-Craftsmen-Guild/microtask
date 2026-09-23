import { OpenAPIHono } from '@hono/zod-openapi'
import type { ApiEnv } from '../auth/env.js'
import { createAuth } from '../auth/login.js'
import type { ApiDeps } from '../deps.js'
import { createMacroplan } from './macroplan/index.js'
import { createMicrotask } from './microtask/index.js'

/**
 * Version 1 of the API: one mount per product, plus the one route that is not a product's.
 *
 * `/auth` is mounted first and carries its own service-key guard. It is where an admin obtains
 * the bearer token every product route demands, so it cannot sit under the principal guard —
 * that would make the credential obtainable only by someone who already had one. A `use('*')`
 * registered at a mount prefix also covers siblings registered under that same prefix later, so
 * the subtrees are kept apart by their paths (`/auth/*`, `/microtask/*` and `/macroplan/*`)
 * rather than by the order of these lines, and a test issues an uncredentialed login to prove it.
 *
 * Each product mount carries its own `requirePrincipal` **and** its own `requireProduct`, and
 * neither could be lifted here. A parent's `use()` runs before the child's middleware, so a
 * product guard registered at this level would run ahead of the principal it has to read.
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
  app.route('/auth', createAuth(deps))
  app.route('/microtask', createMicrotask(deps))
  app.route('/macroplan', createMacroplan(deps))
  return app
}
