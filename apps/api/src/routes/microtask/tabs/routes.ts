import { createRoute, z } from '@hono/zod-openapi'
import {
  DocumentJson,
  NamePayload,
  ReorderTabsPayload,
  Tab,
  TabDocumentSaved,
  TabList,
} from '@repo/contracts'
import { documentBodyLimit } from '../../../http/body-limits.js'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { tabParams, taskParams } from '../../params.js'

/**
 * Create a tab at the end of the task's order. Answers **201**.
 *
 * Gated on a **tab** target naming the task in the path, not on the project: a tab target
 * carries `taskId`, so a seat scoped to one task is cleared here for its own task and refused
 * its siblings by the same policy call, with no branch written down in the handler. That is the
 * difference from creating a *task*, which has no id yet and so has to be project authority.
 */
export const createTabRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['tabs'],
  summary: 'Create a tab at the end of the task',
  security: GUARDED_SECURITY,
  request: {
    params: taskParams,
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    201: {
      description: 'The tab as created, holding an empty document',
      content: { 'application/json': { schema: Tab } },
    },
    ...problemResponses(),
  },
})

/**
 * Renumber every tab of this task into the order given.
 *
 * A static segment beside `/{tabId}`, and reachable only by POST — which no tab-id route
 * answers — so there is no method and path a client could send that both could match. The body
 * carries a bare list because the task is already in the path and tabs have no grouping below
 * it; the service still requires a strict permutation, so a stale client is refused rather than
 * dropping the tab it had not seen.
 */
export const reorderTabsRoute = createRoute({
  method: 'post',
  path: '/reorder',
  tags: ['tabs'],
  summary: "Renumber a task's tabs",
  security: GUARDED_SECURITY,
  request: {
    params: taskParams,
    body: { required: true, content: { 'application/json': { schema: ReorderTabsPayload } } },
  },
  responses: {
    200: {
      description: 'The tabs in their new order',
      content: { 'application/json': { schema: TabList } },
    },
    ...problemResponses(),
  },
})

/** Rename one tab, leaving its document and its place in the order alone. */
export const renameTabRoute = createRoute({
  method: 'patch',
  path: '/{tabId}',
  tags: ['tabs'],
  summary: 'Rename one tab',
  security: GUARDED_SECURITY,
  request: {
    params: tabParams,
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    200: {
      description: 'The tab as renamed',
      content: { 'application/json': { schema: Tab } },
    },
    ...problemResponses(),
  },
})

/**
 * Remove one tab, unless it is the only one the task has left.
 *
 * The last tab is not removable: a task with none has nowhere to put its content and no tab for
 * a reader to open, so the domain refuses it. That refusal arrives as `Invalid` and is rendered
 * **422**, already in the common set — not 409, because nothing changed underneath the caller
 * and reloading would show the same single tab. Renaming it is the operation that was meant.
 */
export const deleteTabRoute = createRoute({
  method: 'delete',
  path: '/{tabId}',
  tags: ['tabs'],
  summary: 'Remove one tab, unless it is the last',
  security: GUARDED_SECURITY,
  request: { params: tabParams },
  responses: {
    204: { description: 'The tab and its document are gone' },
    ...problemResponses(),
  },
})

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
