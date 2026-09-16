import { createRoute, z } from '@hono/zod-openapi'
import { ImportSession, ImportStagedChunk } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { importChunkBodyLimit } from '../../../http/body-limits.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { sessionParams } from '../../params.js'

/**
 * Where in the drop the chunk's file was harvested from.
 *
 * A query parameter rather than a path segment because it holds separators — a harvested path is
 * `drop/<project>/tasks/<task>.json`, not one segment — and rather than a body field because the
 * body is the bytes themselves (ADR 0044): a chunk that had to be wrapped in JSON would be
 * base64 on the wire, which is a third more bytes for the same payload and a decode step between
 * the chunk and the file it is appended to.
 *
 * Declared as a bare string, deliberately. `normaliseImportPath` in `@repo/microtask-domain` is
 * the server's one authority on what an import path may be and it carries its own bounds; a
 * second, narrower rule stated here would refuse paths that one accepts and would be the place a
 * reader had to look first. So this validator admits any string and the normaliser answers 422.
 */
export const chunkQuery = z.object({
  path: z
    .string()
    .meta({ description: 'The normalised relative path this file was harvested at' }),
})

/**
 * Open an import session. Answers **201**.
 *
 * Gated on `workspace:import` against the workspace, which is admin authority: an import creates
 * projects, so it sits above `manage` — the strongest thing a share link can hold — and no scope
 * makes "add projects to this workspace" a question a seat may ask (ADR 0009).
 *
 * It takes no body. What a session is for is named one file at a time by the upload below, and a
 * session that had to be described up front would be describing a drop the browser has not
 * finished reading.
 *
 * The response carries the two caps rather than leaving a client to hard-code them, because the
 * browser is what slices each file.
 */
export const openImportSessionRoute = createRoute({
  method: 'post',
  path: '/sessions',
  tags: ['import'],
  summary: 'Open an import session',
  description:
    'Stages nothing yet. Every upload into this session is chunked, and opening one sweeps any session older than the staging TTL.',
  security: GUARDED_SECURITY,
  responses: {
    201: {
      description: 'The session, with the chunk and session byte caps to upload within',
      content: { 'application/json': { schema: ImportSession } },
    },
    ...problemResponses(),
  },
})

/**
 * Upload one chunk of one file into a session.
 *
 * `importChunkBodyLimit` sits in this route's own `middleware` array, which runs before every
 * validator, so an oversized chunk is refused before the path is looked at. It can only tighten
 * the global cap — every matching limiter runs and the first rejection wins — and it is what makes
 * the 413 name 1,000,000 rather than 4,000,000.
 *
 * `sessionParams` is redeclared rather than inherited from the mount path, because a parameter
 * that exists only on a parent's path is not emitted into the document and has no validated value
 * to build anything from. It is what makes a session id that is not a ULID a 422 before a handler
 * runs.
 *
 * Three refusals beyond the common set, and they mean different things to a client: **413** the
 * chunk is too big and should be sliced smaller, **409** the session is full and should be
 * confirmed or abandoned, **404** the session id names nothing — expired, swept, or never opened.
 * A traversal in `path` is the common 422, and it rejects the file rather than the session.
 */
export const uploadImportChunkRoute = createRoute({
  method: 'post',
  path: '/sessions/{sessionId}/files',
  tags: ['import'],
  summary: 'Upload one chunk of one file into an import session',
  description:
    'The body is the raw bytes of one chunk, appended to this session in the order the chunks arrive. Nothing outside the session is touched.',
  security: GUARDED_SECURITY,
  middleware: [importChunkBodyLimit],
  request: {
    params: sessionParams,
    query: chunkQuery,
    body: {
      required: true,
      description: 'The chunk, as raw bytes',
      content: { 'application/octet-stream': { schema: { type: 'string' } } },
    },
  },
  responses: {
    200: {
      description: 'The chunk was appended, and the session now holds this many bytes',
      content: { 'application/json': { schema: ImportStagedChunk } },
    },
    ...problemResponses([409, 413]),
  },
})
