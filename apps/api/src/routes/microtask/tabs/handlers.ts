import type { RouteHandler } from '@hono/zod-openapi'
import type { TabService } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createTabRoute,
  deleteTabRoute,
  renameTabRoute,
  reorderTabsRoute,
  writeDocumentRoute,
} from './routes.js'

/**
 * Creates a tab at the end of the task's order and answers 201.
 *
 * The target is a `tab` carrying the task from the path, which is the same question every other
 * handler in this file asks. A seat scoped to one task is cleared for its own and refused a
 * sibling's by that one call, so nothing here has to know a task scope exists.
 */
export const createTab =
  (tabs: TabService): RouteHandler<typeof createTabRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    authorize(c, 'tab:create', { kind: 'tab', projectId, taskId })
    return c.json(await tabs.create({ product: PRODUCT, projectId, taskId }, name), 201)
  }

/**
 * Renumbers the task's tabs into the order given.
 *
 * The service requires a strict permutation, so a client reordering from a list it read before
 * somebody else added a tab is refused rather than silently dropping that tab out of the order.
 */
export const reorderTabs =
  (tabs: TabService): RouteHandler<typeof reorderTabsRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId } = c.req.valid('param')
    const { tabIds } = c.req.valid('json')
    authorize(c, 'tab:reorder', { kind: 'tab', projectId, taskId })
    const ordered = await tabs.reorder({ product: PRODUCT, projectId, taskId }, tabIds)
    return c.json({ tabs: ordered }, 200)
  }

/** Renames one tab, leaving its document and its position alone. */
export const renameTab =
  (tabs: TabService): RouteHandler<typeof renameTabRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId, tabId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    authorize(c, 'tab:rename', { kind: 'tab', projectId, taskId })
    return c.json(await tabs.rename({ product: PRODUCT, projectId, taskId }, tabId, name), 200)
  }

/**
 * Removes one tab, answering 204 with no body.
 *
 * A task keeps at least one tab, and the domain refuses the last one as `Invalid` — which the
 * error handler renders as the 422 this route already declares, rather than reaching the 500
 * branch. Nothing is checked here first: the count is the domain's invariant, and a copy of it
 * in this handler would be a second place for it to be wrong.
 */
export const deleteTab =
  (tabs: TabService): RouteHandler<typeof deleteTabRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId, tabId } = c.req.valid('param')
    authorize(c, 'tab:delete', { kind: 'tab', projectId, taskId })
    await tabs.remove({ product: PRODUCT, projectId, taskId }, tabId)
    return c.body(null, 204)
  }

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
