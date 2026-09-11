import { OpenAPIHono } from '@hono/zod-openapi'
import { FolderService } from '@repo/microtask-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import {
  createFolder,
  deleteFolder,
  listFolders,
  renameFolder,
  reorderFolders,
} from './handlers.js'
import {
  createFolderRoute,
  deleteFolderRoute,
  listFoldersRoute,
  renameFolderRoute,
  reorderFoldersRoute,
} from './routes.js'

/**
 * The one flat level of folders a project has, mounted under `/folders`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`: a bare
 * child compiles when mounted and then every `c.get('principal')` inside it is a type error.
 *
 * `/reorder` is registered ahead of `/{folderId}` so the static segment is never a candidate
 * folder id, and the whole app is populated before its parent mounts it — a route added to a
 * child after the parent has served is neither an error nor a warning, only unreachable.
 *
 * No hook is passed anywhere here. A child inherits the root constructor's `defaultHook` through
 * the parent chain `route()` records, resolved at request time, so a validation failure three
 * mounts deep still becomes the 422 problem document every other route answers with.
 */
export function createFolders(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const folders = new FolderService(deps)
  app.openapi(listFoldersRoute, listFolders(folders))
  app.openapi(createFolderRoute, createFolder(folders))
  app.openapi(reorderFoldersRoute, reorderFolders(folders))
  app.openapi(renameFolderRoute, renameFolder(folders))
  app.openapi(deleteFolderRoute, deleteFolder(folders))
  return app
}
