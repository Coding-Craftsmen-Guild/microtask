import type { RouteHandler } from '@hono/zod-openapi'
import type { TabService } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type { writeDocumentRoute } from './routes.js'

/**
 * Replaces one tab's document if it still carries the stamp the client last read.
 *
 * The precondition is read from the validated header rather than from the body, because it is
 * metadata about the request and not part of the document being stored — a client that put it in
 * the body could edit it by accident, and a proxy could not see it at all.
 *
 * The status is the number `200` and never the string `'200'`. A string status is silently
 * ignored and the response goes out as 200 whatever was asked for, which on this route means a
 * refused write reported to the client as a successful save — the exact failure the precondition
 * exists to prevent, reintroduced one quote at a time.
 *
 * Everything the conflict needs — read, compare, write — happens inside the service's lock. This
 * handler holds nothing across the await, so two requests racing here are two calls into the
 * queue rather than two interleaved read-modify-writes.
 */
export const writeDocument =
  (tabs: TabService): RouteHandler<typeof writeDocumentRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId, tabId } = c.req.valid('param')
    const expected = c.req.valid('header')['If-Match']
    const document = c.req.valid('json')
    authorize(c, 'tab:write', { kind: 'tab', projectId, taskId })
    const at = { product: PRODUCT, projectId, taskId }
    const updatedAt = await tabs.writeDocument(at, tabId, document, expected)
    return c.json({ updatedAt }, 200)
  }
