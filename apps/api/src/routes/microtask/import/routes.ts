import { createRoute, z } from '@hono/zod-openapi'
import {
  ImportConfirmRequest,
  ImportConfirmResult,
  ImportExpansion,
  ImportPreview,
  ImportSession,
  ImportStagedChunk,
} from '@repo/contracts'
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
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .meta({ description: 'How many bytes of this file the client believes are already staged' }),
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
 * the global cap — every matching limiter runs and the first rejection wins — and it is the whole
 * of the chunk bound: a body over 1,000,000 bytes and under the global 4,000,000 is refused by
 * nothing else, so dropping this line does not soften the 413 to a larger `maxBytes`, it answers
 * 200 and stages the oversized chunk. Measured.
 *
 * `sessionParams` is redeclared rather than inherited from the mount path, because a parameter
 * that exists only on a parent's path is not emitted into the document and has no validated value
 * to build anything from. It is what makes a session id that is not a ULID a 422 before a handler
 * runs.
 *
 * `offset` is **required**, not defaulted, and that is the decision rather than an omission. A
 * default of 0 would be silently wrong for every chunk after the first, and a default of "wherever
 * the file ends" is what this route did before — under which a client retrying after a timeout
 * appended the same bytes twice, doubling `sessionBytes` and pushing a legitimate drop into the
 * session cap for no reason the operator could see. There is no client to break: the browser side
 * arrives with Task 12. `z.coerce` because a query string carries text, and the bound keeps a
 * negative or fractional offset out of the comparison rather than leaving it to the staging area.
 *
 * Four refusals beyond the common set, and they mean different things to a client: **413** the
 * chunk is too big and should be sliced smaller, **409** either the session is full — confirm it
 * or abandon it — or the offset is not where the file ends, in which case the message names the
 * offset to resume from, **404** the session id names nothing: expired, swept, or never opened.
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

/**
 * Which staged file to expand, as the path it was uploaded at.
 *
 * A query parameter for {@link chunkQuery}'s reasons — it holds separators — and a bare string for
 * the same one: `normaliseImportPath` is the server's authority on what a path may be, and a
 * second rule stated here would be the place a reader had to look first.
 *
 * It names an **already staged** file rather than carrying the archive, because an archive is no
 * smaller than the drop it holds and every upload is chunked (ADR 0044). A route that took the
 * bytes could take at most one chunk of them.
 */
export const archiveQuery = z.object({
  path: z
    .string()
    .meta({ description: 'The staged path of the .zip to expand, as it was uploaded' }),
})

/**
 * Expand one staged archive into the session (ADR 0020).
 *
 * The browser never parses an archive: it uploads the bytes and this expands them, because the
 * hardening an untrusted archive needs cannot be trusted to the client, and a zip parser in two
 * browser bundles is a dependency this product's storage story does not want.
 *
 * It carries no body. The archive is already staged, so the only thing this request adds is the
 * instruction to expand it — which is also why it is a second call rather than something the
 * upload could infer: the last chunk of an archive is indistinguishable from the last chunk of
 * any other file.
 *
 * What the session holds afterwards is exactly what the same folder dropped would have staged: the
 * entries at the paths they name, and the archive itself removed. Every refusal is a refusal of the
 * **archive** — nothing partially expanded is reported as a success — and the three a client has to
 * act on differently are: **422** the archive is unreadable, or an entry breaks one of ADR 0020's
 * rules (a traversal or absolute name, a symbolic link, the entry-count cap, the uncompressed-size
 * cap, the compression-ratio cap, a path that would sit inside a staged file); **409**, the one
 * beyond the common set, an entry names a path this session already stages or the session's byte
 * cap is reached; **404** the session id, or the path inside it, names nothing.
 */
export const expandImportArchiveRoute = createRoute({
  method: 'post',
  path: '/sessions/{sessionId}/archives',
  tags: ['import'],
  summary: 'Expand a staged zip archive into an import session',
  description:
    'Stages every entry at the path it names, under the caps ADR 0020 sets, and removes the archive. Nothing outside the session is touched.',
  security: GUARDED_SECURITY,
  request: {
    params: sessionParams,
    query: archiveQuery,
  },
  responses: {
    200: {
      description: 'The archive was expanded, and the session now holds this many bytes',
      content: { 'application/json': { schema: ImportExpansion } },
    },
    ...problemResponses([409]),
  },
})

/**
 * The plan for one staged session. Answers **200** and **writes nothing** (design §7.3).
 *
 * A `GET`, because that is what it is: every file was staged by the uploads above, and this reads
 * them back, classifies them, runs every blocking check and describes what a confirm would do. It
 * takes no lock either — a read holding the process-wide write queue would stall every client for
 * the length of an admin's deliberation — so the plan it answers is the plan as of the moment it
 * was taken. The confirm runs the same builder again inside the lock it holds, which is what makes
 * a preview a description rather than a promise: a concurrent write can land in between, and the
 * two checks that read the target store — token uniqueness and `projectsPerProduct` — are measured
 * where the write happens.
 *
 * What it mints is narrower than it looks, and worth stating because it is the one thing a preview
 * of the same session twice does not answer identically. A legacy file carries no **tab** ids, so
 * previewing one mints them; it does **not** mint task ids, each legacy tab becoming a task under
 * that tab's own `id` taken from the file verbatim. Measured: two previews of one legacy file are
 * byte-identical, because a tab id reaches no field a row carries. So a client may cache and
 * compare a row, and may address a choice by the `projectId` it reports — which a legacy file
 * carries itself. What it must not do is treat a *tab* id seen anywhere as stable across a
 * preview and the confirm.
 *
 * Every group gets a row, including the ones this repo cannot read, because silent skipping is the
 * failure ADR 0018 was written about. **404** is the session id naming nothing; a hostile harvested
 * path is the common 422; **409** is two files harvested for one normalised path, which the uploads
 * make unreachable — a session stages each path once, by construction — and which is declared
 * because the classifier is the authority that answers it and a 409 the document did not mention
 * would be worse than one that cannot fire.
 */
export const previewImportRoute = createRoute({
  method: 'get',
  path: '/sessions/{sessionId}/preview',
  tags: ['import'],
  summary: 'Preview what one staged import session would do',
  description:
    'Reads the staged session and describes every group in it. Nothing is written, and no project is touched.',
  security: GUARDED_SECURITY,
  request: { params: sessionParams },
  responses: {
    200: {
      description: 'The plan: one row per dropped group, with every reason a group is refused',
      content: { 'application/json': { schema: ImportPreview } },
    },
    ...problemResponses([409]),
  },
})

/**
 * Apply one staged session under the admin's conflict choices. Answers **200**.
 *
 * The body names the session as well as the path, and a body naming a different one is refused
 * rather than resolved in either direction (ADR 0015): the files were staged under one id when
 * they were previewed, and picking one of two ids would apply a session nobody previewed.
 *
 * `choices` is sparse, and the two ways it can be wrong are answered differently because the
 * remedies differ. A choice naming a project **this session does not hold** is a **422** — a
 * malformed request, and the only thing that can see it is this route, since the schema cannot
 * know what was staged. A project that collides with one already on disk and carries **no**
 * choice is a **409** — the request was well formed, the store changed under it, and the remedy is
 * to preview again and choose. Guessing a choice is not an option: `skip`, `new` and `replace`
 * differ in whether tokens already in clients' hands keep working (ADR 0019).
 *
 * **It answers 200 with per-project outcomes, failures included.** A drop is many independent
 * projects and cross-project atomicity is not claimed: a failure on the seventh is no reason to
 * discard the six that landed, and there is no status that is true of a confirm where eight
 * projects were created and one could not be. `ImportConfirmResult` carries a row per project
 * saying which it was. A request that fails as a whole — an unknown session, a bad choice set —
 * never reaches that shape.
 *
 * The session is swept once the apply has begun, success or failure (ADR 0045), which is why a
 * refused choice set is answered **before** anything is applied: a 422 or 409 here leaves the
 * upload staged to be confirmed again, where a failure during the apply does not.
 */
export const confirmImportRoute = createRoute({
  method: 'post',
  path: '/sessions/{sessionId}/confirm',
  tags: ['import'],
  summary: 'Apply one staged import session',
  description:
    'Writes every importable project under the choices given, reports what became of each, and sweeps the session either way.',
  security: GUARDED_SECURITY,
  request: {
    params: sessionParams,
    body: {
      required: true,
      description: 'The session to apply and the conflict choice for each colliding project',
      content: { 'application/json': { schema: ImportConfirmRequest } },
    },
  },
  responses: {
    200: {
      description: 'What the confirm did, project by project',
      content: { 'application/json': { schema: ImportConfirmResult } },
    },
    ...problemResponses([409]),
  },
})
