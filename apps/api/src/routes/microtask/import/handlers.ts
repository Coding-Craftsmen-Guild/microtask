import type { RouteHandler } from '@hono/zod-openapi'
import { Invalid } from '@repo/kernel'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { applyImport } from './apply.js'
import { previewImport } from './preview.js'
import type { ImportStaging } from './staging.js'
import type {
  confirmImportRoute,
  expandImportArchiveRoute,
  openImportSessionRoute,
  previewImportRoute,
  uploadImportChunkRoute,
} from './routes.js'

const MISMATCHED_SESSION =
  'The session named in the body is not the session in the path. The files were staged under one id when they were previewed, so name that one in both.'

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
    const { path: harvested, offset } = c.req.valid('query')
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    return c.json(await staging.append(sessionId, harvested, offset, bytes), 200)
  }

/**
 * Expands one staged archive into the session it was uploaded to.
 *
 * The third gate in this subtree on the same action and the same target, which is what makes
 * "admin authority" a property of the subtree rather than of a handler: a `manage` link is refused
 * here by the same call, and expanding an archive is no weaker an act than uploading it.
 *
 * It reads nothing from the request but the two validated values. The archive's bytes are already
 * on the volume, so no expansion is ever driven by a body this process buffered — and every rule
 * ADR 0020 sets on those bytes is enforced under the session lock, in `staging.expand`.
 */
export const expandImportArchive =
  (staging: ImportStaging): RouteHandler<typeof expandImportArchiveRoute, ApiEnv> =>
  async (c) => {
    authorize(c, 'workspace:import', { kind: 'workspace' })
    const { sessionId } = c.req.valid('param')
    const { path: archive } = c.req.valid('query')
    return c.json(await staging.expand(sessionId, archive), 200)
  }

/**
 * Describes what one staged session would do, without writing anything.
 *
 * The fourth gate in this subtree on the same action and the same target, which is what makes
 * "admin authority" a property of the subtree rather than of a handler. It is `workspace:import`
 * and not a read action, though this reads: what it reads is an unconfirmed drop, and a preview is
 * a full disclosure of it — every project name, every share link's role and scope. A `manage`
 * holder who could ask this could read the contents of a file they never dropped.
 */
export const previewImportSession =
  (deps: ApiDeps): RouteHandler<typeof previewImportRoute, ApiEnv> =>
  async (c) => {
    authorize(c, 'workspace:import', { kind: 'workspace' })
    const { sessionId } = c.req.valid('param')
    return c.json(await previewImport(deps, sessionId), 200)
  }

/**
 * Applies one staged session under the admin's conflict choices.
 *
 * The body names the session as well as the path, and a body naming a different one is refused
 * rather than resolved in either direction (ADR 0015): the files were staged under one id when
 * they were previewed, so picking one of two would apply a session nobody previewed. The path is
 * the address and the body is the assertion, and this is the only place both are visible.
 *
 * `Invalid` and not a second `authorize()`: one gate per operation is what makes a missing gate
 * greppable, and this is not a second question about a target.
 *
 * Everything else is `applyImport`'s, including the one `lock.run` the apply holds. This handler
 * takes no lock of its own — `QueueLock` is not reentrant, and a wrapper here would be the most
 * natural place to hang the process (see `apply.ts`).
 */
export const confirmImportSession =
  (deps: ApiDeps): RouteHandler<typeof confirmImportRoute, ApiEnv> =>
  async (c) => {
    authorize(c, 'workspace:import', { kind: 'workspace' })
    const { sessionId } = c.req.valid('param')
    const request = c.req.valid('json')
    if (request.sessionId !== sessionId) throw new Invalid(MISMATCHED_SESSION)
    return c.json(await applyImport(deps, sessionId, request.choices), 200)
  }
