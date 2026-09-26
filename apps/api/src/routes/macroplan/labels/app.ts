import { OpenAPIHono } from '@hono/zod-openapi'
import type { LabelService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../../auth/env.js'
import { createLabel, deleteLabel, updateLabel } from './handlers.js'
import { createLabelRoute, deleteLabelRoute, updateLabelRoute } from './routes.js'

/**
 * The labels of one plan, mounted under `/labels`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and populated in
 * full before its parent mounts it: a route added to a child after the parent has served is silently
 * unreachable rather than an error, and absent from the document besides.
 *
 * It carries no guard of its own — `createMacroplan` registers `requirePrincipal` and `requireProduct`
 * as `'*'` two mounts above — and every handler below builds its target from the validated `planId`
 * and calls `authorize`.
 *
 * Three routes and no placement route: labels are ordered by their ids, so there is nothing to move.
 * What is **not** here is the write that puts a feature in a group — that is a feature's own field, so
 * it lives under `/features/{featureId}/label` with the other feature writes, and this app is handed
 * no `FeatureService` so it could not make one.
 */
export function createLabels(labels: LabelService): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(createLabelRoute, createLabel(labels))
  app.openapi(updateLabelRoute, updateLabel(labels))
  app.openapi(deleteLabelRoute, deleteLabel(labels))
  return app
}
