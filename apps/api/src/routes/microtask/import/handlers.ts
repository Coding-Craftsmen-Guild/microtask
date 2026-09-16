import type { RouteHandler } from '@hono/zod-openapi'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import type { ImportStaging } from './staging.js'
import type { openImportSessionRoute, uploadImportChunkRoute } from './routes.js'

/**
 * Opens a session and answers the id every upload into it will name.
 *
 * `workspace:import` on the workspace, so this answers the admin and nobody else. Every route in
 * this subtree gates on the same action and the same target, which is what makes "a `manage` link
 * is refused here" a property of the subtree rather than of one handler.
 *
 * The sweep of stale sessions happens inside `open`, after the gate, so an unauthorized request
 * cannot make the API delete anything.
 */
export const openImportSession =
  (staging: ImportStaging): RouteHandler<typeof openImportSessionRoute, ApiEnv> =>
  async (c) => {
    authorize(c, 'workspace:import', { kind: 'workspace' })
    return c.json(await staging.open(), 201)
  }

/**
 * Appends one chunk to one file in a session.
 *
 * The gate comes before this handler reads anything, so no refused request has its chunk read
 * into memory here. Two limiters have already passed by then — the global one on the root app
 * and this route's own — so nothing here measures the chunk; the session's *total* is measured
 * by the staging area, which is the only thing that knows it.
 *
 * `arrayBuffer()` rather than `text()`: a chunk boundary falls wherever the transport put it and
 * can split a multi-byte UTF-8 character, so decoding per chunk would substitute U+FFFD at every
 * such split and a file would not survive reassembly byte for byte.
 */
export const uploadImportChunk =
  (staging: ImportStaging): RouteHandler<typeof uploadImportChunkRoute, ApiEnv> =>
  async (c) => {
    authorize(c, 'workspace:import', { kind: 'workspace' })
    const { sessionId } = c.req.valid('param')
    const { path: harvested } = c.req.valid('query')
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    return c.json(await staging.append(sessionId, harvested, bytes), 200)
  }
