import { OpenAPIHono } from '@hono/zod-openapi'
import { TabService } from '@repo/microtask-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { createTab, deleteTab, renameTab, reorderTabs, writeDocument } from './handlers.js'
import {
  createTabRoute,
  deleteTabRoute,
  renameTabRoute,
  reorderTabsRoute,
  writeDocumentRoute,
} from './routes.js'

/**
 * The tabs of one task, mounted under `/{taskId}/tabs`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and
 * returned fully populated: a route added to a child after its parent has served is neither an
 * error nor a warning, only unreachable.
 *
 * There is no read route. Reading a tab is part of reading its task — `GET /tasks/{taskId}`
 * already answers with every tab and the progress counted from them — so a client that has the
 * task has the documents, and a second address for the same bytes would be a second thing to
 * keep in step.
 *
 * `/reorder` is registered ahead of `/{tabId}` so the static segment is never a candidate tab
 * id, and it answers only POST, which no tab-id route does.
 */
export function createTabs(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const tabs = new TabService(deps)
  app.openapi(createTabRoute, createTab(tabs))
  app.openapi(reorderTabsRoute, reorderTabs(tabs))
  app.openapi(renameTabRoute, renameTab(tabs))
  app.openapi(deleteTabRoute, deleteTab(tabs))
  app.openapi(writeDocumentRoute, writeDocument(tabs))
  return app
}
