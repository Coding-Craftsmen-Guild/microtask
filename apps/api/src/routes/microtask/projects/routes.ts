import { createRoute } from '@hono/zod-openapi'
import { NamePayload, ProjectList, ProjectView } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { projectParams } from '../../params.js'

/**
 * List every project in this product.
 *
 * A collection route has no per-resource target, so ADR 0009 reserves it to the admin rather
 * than letting a link holder receive a filtered list: there is no scope in which "every project"
 * is a question a seat may ask.
 */
export const listProjectsRoute = createRoute({
  method: 'get',
  path: '/projects',
  tags: ['projects'],
  summary: 'List every project in this product',
  security: GUARDED_SECURITY,
  responses: {
    200: {
      description: 'Every project, most recently updated first',
      content: { 'application/json': { schema: ProjectList } },
    },
    ...problemResponses(),
  },
})

/** Create an empty project. Answers **201**, and the created project is the body. */
export const createProjectRoute = createRoute({
  method: 'post',
  path: '/projects',
  tags: ['projects'],
  summary: 'Create an empty project',
  security: GUARDED_SECURITY,
  request: {
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    201: {
      description: 'The project as created',
      content: { 'application/json': { schema: ProjectView } },
    },
    ...problemResponses(),
  },
})

/** Read one project: its folders, its task entries, and — where cleared — its share links. */
export const readProjectRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['projects'],
  summary: 'Read one project',
  description: 'Folders, task entries, and — for a caller the policy clears — its share links.',
  security: GUARDED_SECURITY,
  request: { params: projectParams },
  responses: {
    200: {
      description: 'The project, shaped for whoever asked',
      content: { 'application/json': { schema: ProjectView } },
    },
    ...problemResponses(),
  },
})

/** Rename one project, leaving everything under it alone. */
export const renameProjectRoute = createRoute({
  method: 'patch',
  path: '/',
  tags: ['projects'],
  summary: 'Rename one project',
  security: GUARDED_SECURITY,
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: NamePayload } } },
  },
  responses: {
    200: {
      description: 'The project as renamed',
      content: { 'application/json': { schema: ProjectView } },
    },
    ...problemResponses(),
  },
})

/**
 * Remove one project, everything under it, and the share tokens that pointed at it.
 *
 * Answers 204 with no body: there is no representation of a project that is gone, and a body
 * here would be a shape a client could come to depend on.
 */
export const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/',
  tags: ['projects'],
  summary: 'Remove one project and everything under it',
  security: GUARDED_SECURITY,
  request: { params: projectParams },
  responses: {
    204: { description: 'The project is gone, along with its tasks and its share links' },
    ...problemResponses(),
  },
})
