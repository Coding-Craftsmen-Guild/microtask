import { createRoute } from '@hono/zod-openapi'
import { Folder, FolderList, NamePayload, ReorderFoldersPayload } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { folderParams, projectParams } from '../../params.js'

/**
 * List one project's folders, in order.
 *
 * Gated on a **folder** target rather than a project one, which is what refuses a task-scoped
 * link: a seat holding one task must not learn the name of the folder that task sits in, because
 * that name can itself identify another client (ADR 0011).
 */
export const listFoldersRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['folders'],
  summary: "List one project's folders",
  security: GUARDED_SECURITY,
  request: { params: projectParams },
  responses: {
    200: {
      description: 'The folders, in the order they are shown',
      content: { 'application/json': { schema: FolderList } },
    },
    ...problemResponses(),
  },
})

/** Create a folder at the end of the order. Answers **201**. */
export const createFolderRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['folders'],
  summary: 'Create a folder at the end of the order',
  security: GUARDED_SECURITY,
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    201: {
      description: 'The folder as created',
      content: { 'application/json': { schema: Folder } },
    },
    ...problemResponses(),
  },
})

/**
 * Renumber every folder in this project into the order given.
 *
 * A static segment beside `/{folderId}`, and reachable only by POST, which no folder id route
 * answers — so there is no method and path a client could send that both could match.
 */
export const reorderFoldersRoute = createRoute({
  method: 'post',
  path: '/reorder',
  tags: ['folders'],
  summary: "Renumber a project's folders",
  security: GUARDED_SECURITY,
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: ReorderFoldersPayload } } },
  },
  responses: {
    200: {
      description: 'The folders in their new order',
      content: { 'application/json': { schema: FolderList } },
    },
    ...problemResponses(),
  },
})

/** Rename one folder, leaving its place in the order and the tasks inside it alone. */
export const renameFolderRoute = createRoute({
  method: 'patch',
  path: '/{folderId}',
  tags: ['folders'],
  summary: 'Rename one folder',
  security: GUARDED_SECURITY,
  request: {
    params: folderParams,
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    200: {
      description: 'The folder as renamed',
      content: { 'application/json': { schema: Folder } },
    },
    ...problemResponses(),
  },
})

/**
 * Remove one folder, moving the tasks it held to the project root.
 *
 * Nothing is deleted but the grouping, so 204 is the whole answer: the tasks are still there, at
 * an address the project representation already gives.
 */
export const deleteFolderRoute = createRoute({
  method: 'delete',
  path: '/{folderId}',
  tags: ['folders'],
  summary: 'Remove one folder, keeping the tasks it held',
  security: GUARDED_SECURITY,
  request: { params: folderParams },
  responses: {
    204: { description: 'The folder is gone and its tasks sit at the project root' },
    ...problemResponses(),
  },
})
