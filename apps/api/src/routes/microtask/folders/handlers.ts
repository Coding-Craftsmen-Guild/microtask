import type { RouteHandler } from '@hono/zod-openapi'
import type { FolderService } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createFolderRoute,
  deleteFolderRoute,
  listFoldersRoute,
  renameFolderRoute,
  reorderFoldersRoute,
} from './routes.js'

/**
 * Lists the folders of one project, in order.
 *
 * The target is a `folder` and not the project, and the two decide differently: a task-scoped
 * link is cleared for `project:read` on the project and refused it on a folder. That refusal is
 * the breadcrumb ADR 0011 withholds, expressed once in the policy rather than restated here.
 */
export const listFolders =
  (folders: FolderService): RouteHandler<typeof listFoldersRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    authorize(c, 'project:read', { kind: 'folder', projectId })
    return c.json({ folders: await folders.list({ product: PRODUCT, projectId }) }, 200)
  }

/** Creates a folder at the end of the order and answers 201. */
export const createFolder =
  (folders: FolderService): RouteHandler<typeof createFolderRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    authorize(c, 'folder:create', { kind: 'folder', projectId })
    return c.json(await folders.create({ product: PRODUCT, projectId }, name), 201)
  }

/**
 * Renumbers every folder in the project into the order given.
 *
 * The service requires a strict permutation, so a stale client that omits a folder someone else
 * added is refused rather than silently dropping it out of the order.
 */
export const reorderFolders =
  (folders: FolderService): RouteHandler<typeof reorderFoldersRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { folderIds } = c.req.valid('json')
    authorize(c, 'folder:reorder', { kind: 'folder', projectId })
    const ordered = await folders.reorder({ product: PRODUCT, projectId }, folderIds)
    return c.json({ folders: ordered }, 200)
  }

/** Renames one folder, leaving its position and its tasks alone. */
export const renameFolder =
  (folders: FolderService): RouteHandler<typeof renameFolderRoute, ApiEnv> =>
  async (c) => {
    const { projectId, folderId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    authorize(c, 'folder:rename', { kind: 'folder', projectId })
    return c.json(await folders.rename({ product: PRODUCT, projectId }, folderId, name), 200)
  }

/** Removes one folder, moving the tasks it held to the project root. */
export const deleteFolder =
  (folders: FolderService): RouteHandler<typeof deleteFolderRoute, ApiEnv> =>
  async (c) => {
    const { projectId, folderId } = c.req.valid('param')
    authorize(c, 'folder:delete', { kind: 'folder', projectId })
    await folders.remove({ product: PRODUCT, projectId }, folderId)
    return c.body(null, 204)
  }
