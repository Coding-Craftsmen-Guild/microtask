import { createRoute, z } from '@hono/zod-openapi'
import { DocumentJson, TabDocumentSaved } from '@repo/contracts'
import { documentBodyLimit } from '../../../http/body-limits.js'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { tabParams } from '../../params.js'

/**
 * The precondition a document write carries: the `updatedAt` the client last received.
 *
 * Spelled in canonical mixed case because the key is emitted **verbatim** as the parameter name
 * in the document — a lower-cased schema key would tell every generated client to send
 * `if-match`, which works on the wire and reads wrong in the reference. Matching is
 * case-insensitive regardless: the validator builds a lower-cased key map before it parses, so
 * `c.req.valid('header')['If-Match']` resolves whatever casing arrived.
 *
 * It is `min(1)` and required, so a client that omits it is answered by the validation hook and
 * never by the conflict branch. Treating a missing precondition as a stale write would make
 * `conflict` mean two different things — "somebody else saved" and "you forgot to say what you
 * were editing" — and only one of those is worth reloading for.
 */
export const ifMatchHeader = z.object({
  'If-Match': z.string().min(1).meta({ description: 'The updatedAt this write is based on' }),
})

/**
 * Replace one tab's document, if it has not changed since the client last read it.
 *
 * `documentBodyLimit` sits in the route's own `middleware` array, which runs before every
 * validator, so a body far larger than any document could be is refused before it is parsed —
 * the global limit is the loosest cap in the app and cannot be tightened for one route from
 * outside. The stricter bound the domain enforces is measured on the parsed document instead.
 *
 * Both success and conflict are declared, the conflict through `problemResponses` because that
 * is the shape it really has — the domain throws `Conflict` and the error handler renders every
 * thrown `AppError` as `application/problem+json`, so declaring a bespoke 409 body would
 * describe a response this API never sends. A 409 is a normal outcome here rather than a
 * failure: the keepalive flush a page sends as it goes away is by construction the request most
 * likely to land late, and a late write *should* lose (ADR 0016).
 */
export const writeDocumentRoute = createRoute({
  method: 'put',
  path: '/{tabId}/document',
  tags: ['tabs'],
  summary: "Replace a tab's document, conditionally",
  description:
    'Requires If-Match carrying the updatedAt the client last received. A mismatch is 409 and the client reloads rather than overwriting.',
  security: GUARDED_SECURITY,
  middleware: [documentBodyLimit],
  request: {
    params: tabParams,
    headers: ifMatchHeader,
    body: { required: true, content: { 'application/json': { schema: DocumentJson } } },
  },
  responses: {
    200: {
      description: 'The document was replaced',
      content: { 'application/json': { schema: TabDocumentSaved } },
    },
    ...problemResponses([409, 413]),
  },
})
