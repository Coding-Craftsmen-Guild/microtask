import { createRoute } from '@hono/zod-openapi'
import {
  CreateTaskPayload,
  MoveTaskPayload,
  NamePayload,
  ReorderTasksPayload,
  TaskEntry,
  TaskEntryList,
  TaskView,
} from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { projectParams, taskParams } from '../../params.js'

/**
 * Create a task at the end of its folder. Answers **201**.
 *
 * Gated on the **project**, because the task being created has no id yet to name a target with.
 * That is also the right question: creating a task is project authority, and a task-scoped seat
 * reaches its one task and no more.
 */
export const createTaskRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['tasks'],
  summary: 'Create a task',
  security: GUARDED_SECURITY,
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: CreateTaskPayload } } },
  },
  responses: {
    201: {
      description: 'The manifest entry for the task as created',
      content: { 'application/json': { schema: TaskEntry } },
    },
    ...problemResponses(),
  },
})

/** Renumber one folder group's tasks. Positions are dense per folder, so the group is named. */
export const reorderTasksRoute = createRoute({
  method: 'post',
  path: '/reorder',
  tags: ['tasks'],
  summary: "Renumber one folder group's tasks",
  security: GUARDED_SECURITY,
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: ReorderTasksPayload } } },
  },
  responses: {
    200: {
      description: 'The group in its new order',
      content: { 'application/json': { schema: TaskEntryList } },
    },
    ...problemResponses(),
  },
})

/** Read one task: its entry, its tabs, and — where cleared — the folder it sits in. */
export const readTaskRoute = createRoute({
  method: 'get',
  path: '/{taskId}',
  tags: ['tasks'],
  summary: 'Read one task and its tabs',
  security: GUARDED_SECURITY,
  request: { params: taskParams },
  responses: {
    200: {
      description: 'The task, shaped for whoever asked',
      content: { 'application/json': { schema: TaskView } },
    },
    ...problemResponses(),
  },
})

/** Rename one task. Touches no document, so the response is the manifest entry alone. */
export const renameTaskRoute = createRoute({
  method: 'patch',
  path: '/{taskId}',
  tags: ['tasks'],
  summary: 'Rename one task',
  security: GUARDED_SECURITY,
  request: {
    params: taskParams,
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    200: {
      description: 'The manifest entry as renamed',
      content: { 'application/json': { schema: TaskEntry } },
    },
    ...problemResponses(),
  },
})

/** Remove one task and its document. */
export const deleteTaskRoute = createRoute({
  method: 'delete',
  path: '/{taskId}',
  tags: ['tasks'],
  summary: 'Remove one task',
  security: GUARDED_SECURITY,
  request: { params: taskParams },
  responses: {
    204: { description: 'The task and its tabs are gone' },
    ...problemResponses(),
  },
})

/**
 * Move one task to the end of another folder, or to the project root.
 *
 * Its own route rather than a field on the rename body, because the policy grants `task:rename`
 * to `write` and `task:move` to `manage` — one request can only ask one question, and folding
 * them together would have to ask the weaker one.
 */
export const moveTaskRoute = createRoute({
  method: 'post',
  path: '/{taskId}/move',
  tags: ['tasks'],
  summary: 'Move one task between folders',
  security: GUARDED_SECURITY,
  request: {
    params: taskParams,
    body: { required: true, content: { 'application/json': { schema: MoveTaskPayload } } },
  },
  responses: {
    200: {
      description: 'The manifest entry where it now sits',
      content: { 'application/json': { schema: TaskEntry } },
    },
    ...problemResponses(),
  },
})
