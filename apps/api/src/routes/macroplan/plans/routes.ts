import { createRoute } from '@hono/zod-openapi'
import { CreatePlanPayload, PlanList, PlanView, UpdatePlanPayload } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { planParams } from '../params.js'

/**
 * List every plan in this product.
 *
 * A collection route has no per-resource target, so ADR 0009 reserves it to the admin rather than
 * letting a seat holder receive a filtered list: there is no scope in which "every plan" is a
 * question a seat may ask.
 *
 * The rows are `PlanListItem`s and not `PlanView`s. At this product's own bounds a list is 200 plans
 * holding up to 2,000 items each — 400,000 items on the one screen that renders none of them — and
 * a `PlanView` would carry each plan's live seats besides (ADR 0033).
 */
export const listPlansRoute = createRoute({
  method: 'get',
  path: '/plans',
  tags: ['plans'],
  summary: 'List every plan in this product',
  security: GUARDED_SECURITY,
  responses: {
    200: {
      description: 'Every plan, most recently updated first',
      content: { 'application/json': { schema: PlanList } },
    },
    ...problemResponses(),
  },
})

/**
 * Create an empty plan. Answers **201**, and the created plan is the body.
 *
 * `sprintLengthDays` and `timezone` are optional in the body because `PlanService` decides the
 * default for each; a schema default would state that policy a second time, in a place it can drift
 * from the first.
 */
export const createPlanRoute = createRoute({
  method: 'post',
  path: '/plans',
  tags: ['plans'],
  summary: 'Create an empty plan',
  security: GUARDED_SECURITY,
  request: {
    body: { required: true, content: { 'application/json': { schema: CreatePlanPayload } } },
  },
  responses: {
    201: {
      description: 'The plan as created, with the schedule of an empty timeline',
      content: { 'application/json': { schema: PlanView } },
    },
    ...problemResponses(),
  },
})

/**
 * Read one plan: its rails, its features, its items, and the schedule derived from all three.
 *
 * The schedule is **derived on every read and stored nowhere** (spec §3.4), so a plan's bars cannot
 * disagree with the plan they were computed from.
 */
export const readPlanRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['plans'],
  summary: 'Read one plan and its schedule',
  description: 'Rails, features, items, the derived schedule, and — for an admin — its seats.',
  security: GUARDED_SECURITY,
  request: { params: planParams },
  responses: {
    200: {
      description: 'The plan, shaped for whoever asked',
      content: { 'application/json': { schema: PlanView } },
    },
    ...problemResponses(),
  },
})

/**
 * Rename one plan, retime it, or both, leaving everything on its rails alone.
 *
 * Retiming moves every derived date and every sprint boundary, which is the point: the schedule is
 * derived from `startDate` and `sprintLengthDays`, so moving the origin means the whole plan shifts.
 * The response therefore carries the freshly derived schedule rather than only the settings.
 *
 * `UpdatePlanPayload` refuses an empty body, so a request that asks for nothing is a 422 rather than
 * a write that stamps `updatedAt` and changes nothing.
 */
export const updatePlanRoute = createRoute({
  method: 'patch',
  path: '/',
  tags: ['plans'],
  summary: 'Rename or retime one plan',
  security: GUARDED_SECURITY,
  request: {
    params: planParams,
    body: { required: true, content: { 'application/json': { schema: UpdatePlanPayload } } },
  },
  responses: {
    200: {
      description: 'The plan as changed, with the schedule recomputed from its new calendar',
      content: { 'application/json': { schema: PlanView } },
    },
    ...problemResponses(),
  },
})

/**
 * Remove one plan, everything on its rails, and the share tokens that pointed at it.
 *
 * Answers 204 with no body: there is no representation of a plan that is gone, and a body here
 * would be a shape a client could come to depend on.
 */
export const deletePlanRoute = createRoute({
  method: 'delete',
  path: '/',
  tags: ['plans'],
  summary: 'Remove one plan and everything on it',
  security: GUARDED_SECURITY,
  request: { params: planParams },
  responses: {
    204: { description: 'The plan is gone, along with its items and its seats' },
    ...problemResponses(),
  },
})
