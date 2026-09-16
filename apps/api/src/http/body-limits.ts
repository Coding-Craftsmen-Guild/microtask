import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { MAX_DOCUMENT_BYTES } from '@repo/microtask-domain'
import { codeForStatus, problemResponse } from './problem.js'

/**
 * The loosest cap in the app, and the only one every request passes through.
 *
 * There is no default body limit in hono: a 20 MB POST with no limiter is accepted in full. So
 * this exists to put *a* bound on an unauthenticated socket, and 4,000,000 bytes is that bound
 * because it is the one the app being replaced already draws — `apps/legacy/server.js:97` counts
 * the incoming chunks and throws 413 once `size > 4000000`. hono compares the same way
 * (`contentLength > maxSize`), so a body of exactly this many bytes is accepted here and there
 * alike and no client that works today is refused. That is a **transport** bound and nothing
 * else: the 2 MB in `MAX_DOCUMENT_BYTES` is what a stored document may be, and the domain still
 * checks it after parsing.
 *
 * It is the loosest cap rather than the strictest because every matching limiter runs and the
 * first rejection wins. A strict global could not be loosened for the one route that legitimately
 * carries a document, so strictness has to live per route instead.
 */
export const GLOBAL_BODY_LIMIT_BYTES = 4_000_000

const ENVELOPE_HEADROOM_BYTES = 500_000

/**
 * The cap for the one route that carries a whole tab document.
 *
 * Derived from the domain's own bound rather than restated, so changing what a document may be
 * moves the transport cap with it. The headroom covers the JSON envelope the document travels
 * in, and a client that escapes non-ASCII text as `\uXXXX` — six bytes on the wire for a
 * character the domain counts as one to three. It cannot cover an adversarially escaped body,
 * and is not meant to: `assertSafeDocument` measures the parsed document in UTF-8 bytes and is
 * the bound that decides what gets stored. This one only stops the server buffering and parsing
 * megabytes that the domain would certainly reject.
 */
export const DOCUMENT_BODY_LIMIT_BYTES = MAX_DOCUMENT_BYTES + ENVELOPE_HEADROOM_BYTES

const refuse =
  (maxBytes: number) =>
  (c: Context): Response =>
    problemResponse(
      {
        status: 413,
        code: codeForStatus(413),
        detail: `This request body is larger than the ${maxBytes} bytes this route accepts.`,
        instance: c.req.path,
      },
      { maxBytes },
    )

/**
 * Builds a limiter that refuses an oversized body as an RFC 7807 document naming the cap.
 *
 * Without an explicit `onError` hono answers `Payload Too Large` as `text/plain`, which is the
 * one status in this app a client could not parse the same way as every other failure.
 *
 * Two things about what it measures. A request carrying `content-length` is decided on the
 * header alone, without reading a byte — which is the fast path production takes and the reason
 * a test that omits the header proves nothing about it. A request without one, or with
 * `transfer-encoding`, is counted chunk by chunk as it streams. A body that *lies* about its
 * length is admitted, because the header is trusted when it is present; the node server rejects
 * the mismatch itself before it becomes a way past this.
 */
export const jsonBodyLimit = (maxBytes: number): MiddlewareHandler =>
  bodyLimit({ maxSize: maxBytes, onError: refuse(maxBytes) })

/** The global limiter, registered on the root app before anything it protects is mounted. */
export const globalBodyLimit: MiddlewareHandler = jsonBodyLimit(GLOBAL_BODY_LIMIT_BYTES)

/** The limiter for the tab-document write, declared in that route's own `middleware` array. */
export const documentBodyLimit: MiddlewareHandler = jsonBodyLimit(DOCUMENT_BODY_LIMIT_BYTES)

/**
 * The cap on one import chunk, and the tighter half of ADR 0044's two bounds.
 *
 * Every import upload is chunked, uniformly — one code path, no size branch — so this is not a
 * ceiling that only large files meet. A browser slices each harvested file (and a `.zip`) with
 * `Blob.slice()` at this many bytes and posts each slice as a whole request body, which the API
 * appends into the session's staging file.
 *
 * It is a quarter of {@link GLOBAL_BODY_LIMIT_BYTES}, and the gap between the two caps is what a
 * test of this bound has to aim at. A body in that gap — over this cap, under the global one — is
 * refused **only** by the route's own limiter: without it in the route's `middleware` array the
 * global limiter admits the body and the request answers 200. Measured, at this cap plus one byte.
 * So the **status** is what catches a route that lost its limiter, and `maxBytes` — with
 * `toBeLessThan(GLOBAL_BODY_LIMIT_BYTES)` beside it — is what catches one that was loosened past
 * this number. Neither assertion covers the other's failure, which is why both are written.
 *
 * Measured against the live volume this replaces: ADR 0044 records `data/projects/` as 8,608
 * bytes across two files on 2026-09-12, so every file there is one chunk today. The reason the
 * cap is not simply raised instead is that {@link GLOBAL_BODY_LIMIT_BYTES} is registered ahead of
 * the credential guard, and raising it to cover the ~80 MB ceiling this product's own limits allow
 * would hand that to every unauthenticated socket.
 */
export const IMPORT_CHUNK_LIMIT_BYTES = 1_000_000

/** The limiter for an import chunk, declared in that route's own `middleware` array. */
export const importChunkBodyLimit: MiddlewareHandler = jsonBodyLimit(IMPORT_CHUNK_LIMIT_BYTES)
