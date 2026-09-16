import { OpenAPIHono } from '@hono/zod-openapi'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { expandImportArchive, openImportSession, uploadImportChunk } from './handlers.js'
import {
  expandImportArchiveRoute,
  openImportSessionRoute,
  uploadImportChunkRoute,
} from './routes.js'
import { ImportStaging } from './staging.js'

/**
 * The import subtree, mounted under `/import`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`: a bare child
 * compiles when mounted and then every `c.get('principal')` inside it is a type error.
 *
 * Both routes share one {@link ImportStaging}, which holds no per-request state — the session's
 * accounting lives in its marker file on the volume, so a chunk arriving after a restart is
 * measured against what is actually staged rather than against a counter this process lost.
 *
 * Every route is registered before this returns. A route added to a child after its parent mounted
 * it is neither an error nor a warning, only unreachable, and here that would mean an upload
 * address answering 404 while the document still advertised it.
 */
export function createImport(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const staging = new ImportStaging(deps)
  app.openapi(openImportSessionRoute, openImportSession(staging))
  app.openapi(uploadImportChunkRoute, uploadImportChunk(staging))
  app.openapi(expandImportArchiveRoute, expandImportArchive(staging))
  return app
}
