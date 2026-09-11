import type { RouteHandler } from '@hono/zod-openapi'
import type { ProjectService, TaskService } from '@repo/microtask-domain'
import { taskView } from '@repo/microtask-domain'
import { authorize } from '../../../auth/authorize.js'
import type { ApiEnv } from '../../../auth/env.js'
import { PRODUCT } from '../product.js'
import type {
  createTaskRoute,
  deleteTaskRoute,
  moveTaskRoute,
  readTaskRoute,
  renameTaskRoute,
  reorderTasksRoute,
} from './routes.js'

/** Creates a task at the end of its folder and answers 201. */
export const createTask =
  (tasks: TaskService): RouteHandler<typeof createTaskRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { name, folderId } = c.req.valid('json')
    authorize(c, 'task:create', { kind: 'project', projectId })
    const entry = await tasks.create({ product: PRODUCT, projectId }, name, folderId ?? null)
    return c.json(entry, 201)
  }

/**
 * Renumbers one folder group's tasks into the order given.
 *
 * Asks `task:reorder` on the **project**, beside `folder:reorder` and `tab:reorder`. It asked
 * `task:move` while the kernel named no such action, and that conflated two different
 * operations: a move changes which folder one task belongs to, and a client holding it can file
 * work anywhere; a reorder renumbers a group a caller already sees and moves nothing between
 * folders. Both sit at `manage` today, so the route's answers do not change — what changes is
 * that granting one later no longer silently grants the other.
 */
export const reorderTasks =
  (tasks: TaskService): RouteHandler<typeof reorderTasksRoute, ApiEnv> =>
  async (c) => {
    const { projectId } = c.req.valid('param')
    const { folderId, taskIds } = c.req.valid('json')
    authorize(c, 'task:reorder', { kind: 'project', projectId })
    const group = await tasks.reorder({ product: PRODUCT, projectId }, folderId, taskIds)
    return c.json({ tasks: group }, 200)
  }

/**
 * Reads one task, its tabs, and the folder it sits in where the caller may be told.
 *
 * The view counts progress from the tabs in this same payload rather than echoing the manifest
 * cache, so what a client renders can never contradict the checkboxes beside it.
 *
 * Two reads, sequentially and never nested: `TaskService.read` takes the lock when it has a stale
 * cache to correct, and `QueueLock` is not reentrant, so a manifest read held open around it would
 * wedge the queue rather than fail. Their **order** is not load-bearing — a mutation swapping them
 * killed no test, and cannot, because the only field correction touches is the cached progress and
 * this view counts progress from the tabs instead.
 */
export const readTask =
  (tasks: TaskService, projects: ProjectService): RouteHandler<typeof readTaskRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId } = c.req.valid('param')
    const principal = authorize(c, 'task:read', { kind: 'task', projectId, taskId })
    const { document } = await tasks.read({ product: PRODUCT, projectId, taskId })
    const found = await projects.read({ product: PRODUCT, projectId })
    return c.json(taskView(found, document, principal), 200)
  }

/** Renames one task, touching no document. */
export const renameTask =
  (tasks: TaskService): RouteHandler<typeof renameTaskRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    authorize(c, 'task:rename', { kind: 'task', projectId, taskId })
    return c.json(await tasks.rename({ product: PRODUCT, projectId, taskId }, name), 200)
  }

/** Removes one task and its document, answering 204 with no body. */
export const deleteTask =
  (tasks: TaskService): RouteHandler<typeof deleteTaskRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId } = c.req.valid('param')
    authorize(c, 'task:delete', { kind: 'task', projectId, taskId })
    await tasks.remove({ product: PRODUCT, projectId, taskId })
    return c.body(null, 204)
  }

/** Moves one task to the end of another folder, or to the project root when given null. */
export const moveTask =
  (tasks: TaskService): RouteHandler<typeof moveTaskRoute, ApiEnv> =>
  async (c) => {
    const { projectId, taskId } = c.req.valid('param')
    const { folderId } = c.req.valid('json')
    authorize(c, 'task:move', { kind: 'task', projectId, taskId })
    return c.json(await tasks.move({ product: PRODUCT, projectId, taskId }, folderId), 200)
  }
