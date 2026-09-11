import { OpenAPIHono } from '@hono/zod-openapi'
import { ProjectService, TaskService } from '@repo/microtask-domain'
import type { ApiEnv } from '../../../auth/env.js'
import type { ApiDeps } from '../../../deps.js'
import { createTabs } from '../tabs/app.js'
import {
  createTask,
  deleteTask,
  moveTask,
  readTask,
  renameTask,
  reorderTasks,
} from './handlers.js'
import {
  createTaskRoute,
  deleteTaskRoute,
  moveTaskRoute,
  readTaskRoute,
  renameTaskRoute,
  reorderTasksRoute,
} from './routes.js'

/**
 * The tasks of one project, mounted under `/tasks`.
 *
 * Typed `OpenAPIHono<ApiEnv>` because the generic does not travel through `route()`, and
 * populated in full before its parent mounts it: a route added to a child after the parent has
 * served is silently unreachable rather than an error.
 *
 * `/reorder` is registered ahead of `/{taskId}`, and answers only POST — which no task-id route
 * does — so no request can match both.
 *
 * The tabs of a task hang below it, mounted last and already complete, because a tab has no
 * address that does not name the task holding it.
 */
export function createTasks(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>()
  const tasks = new TaskService(deps)
  const projects = new ProjectService(deps)
  app.openapi(createTaskRoute, createTask(tasks))
  app.openapi(reorderTasksRoute, reorderTasks(tasks))
  app.openapi(readTaskRoute, readTask(tasks, projects))
  app.openapi(renameTaskRoute, renameTask(tasks))
  app.openapi(deleteTaskRoute, deleteTask(tasks))
  app.openapi(moveTaskRoute, moveTask(tasks))
  app.route('/:taskId/tabs', createTabs(deps))
  return app
}
