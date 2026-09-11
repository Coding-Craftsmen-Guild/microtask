import { OpenAPIHono } from '@hono/zod-openapi'
import { TabService } from '@repo/microtask-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { writeDocument } from './handlers.js'
import { writeDocumentRoute } from './routes.js'

/**
 * The tabs of one task, mounted under `/{taskId}/tabs`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and
 * returned fully populated: a route added to a child after its parent has served is neither an
 * error nor a warning, only unreachable.
 *
 * It carries one route today. Reading a tab is part of reading its task — `GET /tasks/{taskId}`
 * already answers with every tab and the progress counted from them — so there is no separate
 * read here, and a client that has the task has the document.
 */
export function createTabs(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const tabs = new TabService(deps)
  app.openapi(writeDocumentRoute, writeDocument(tabs))
  return app
}
