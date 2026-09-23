import { OpenAPIHono } from '@hono/zod-openapi'
import type { FeatureService } from '@repo/macroplan-domain'
import type { ApiEnv } from '../../../auth/env.js'
import {
  createFeature,
  deleteFeature,
  placeFeature,
  setDependencies,
  updateFeature,
} from './handlers.js'
import {
  createFeatureRoute,
  deleteFeatureRoute,
  placeFeatureRoute,
  setDependenciesRoute,
  updateFeatureRoute,
} from './routes.js'

/**
 * The features of one plan, mounted under `/features`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and populated in
 * full before its parent mounts it: a route added to a child after the parent has served is silently
 * unreachable rather than an error, and absent from the document besides.
 *
 * It carries no guard of its own — `createMacroplan` registers both as `'*'` two mounts above — and
 * every handler below builds its target from the validated `planId` and calls `authorize`.
 */
export function createFeatures(features: FeatureService): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  app.openapi(createFeatureRoute, createFeature(features))
  app.openapi(placeFeatureRoute, placeFeature(features))
  app.openapi(setDependenciesRoute, setDependencies(features))
  app.openapi(updateFeatureRoute, updateFeature(features))
  app.openapi(deleteFeatureRoute, deleteFeature(features))
  return app
}
