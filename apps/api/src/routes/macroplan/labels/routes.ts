import { createRoute } from '@hono/zod-openapi'
import { CreateLabelPayload, UpdateLabelPayload } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { labelParams, planParams } from '../params.js'
import { PLAN_RESPONSE } from '../plan-response.js'

/**
 * Add a label to a plan: a group features on any rail can be put into. Answers the whole plan.
 *
 * 200 and the plan rather than 201 and the label, for the reason `PLAN_RESPONSE` records for every
 * route in this subtree: a client renders a plan, and the label alone would send it back for one.
 *
 * The body carries no placement and there is no route to reorder one. Labels are ordered by the ids
 * they are created with — a ULID opens with its creation millisecond — so creation order is already a
 * total order and a stored position would be a field with no writer.
 */
export const createLabelRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['labels'],
  summary: 'Add a label to a plan',
  security: GUARDED_SECURITY,
  request: {
    params: planParams,
    body: { required: true, content: { 'application/json': { schema: CreateLabelPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Rename one label, recolour it, or both. Answers the whole plan and moves no feature.
 *
 * One gate for either field, exactly as the epic `PATCH` has one: a group's name and its colour are
 * both `label:rename`, and there is no second action a body changing only the colour could ask for.
 * It refuses an empty body, so a request asking for nothing is a 422 rather than a write that stamps
 * the plan's `updatedAt` and changes nothing — which a plan list is ordered by.
 */
export const updateLabelRoute = createRoute({
  method: 'patch',
  path: '/{labelId}',
  tags: ['labels'],
  summary: 'Rename or recolour one label',
  security: GUARDED_SECURITY,
  request: {
    params: labelParams,
    body: { required: true, content: { 'application/json': { schema: UpdateLabelPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Remove one label and clear it off every feature that was in it. Answers the plan that remains.
 *
 * **It deletes no feature**, which is the one thing here that a reader of `DELETE …/epics/{epicId}`
 * beside it would guess wrongly. A rail is where work lives, so removing one removes the work; a
 * group is a way of seeing work that lives somewhere else, so removing one leaves every feature on
 * its rail with its estimate, its pin, its edges and its items, in no group.
 *
 * So the plan it answers has the same spans it was called with: `@repo/schedule` reads no group.
 */
export const deleteLabelRoute = createRoute({
  method: 'delete',
  path: '/{labelId}',
  tags: ['labels'],
  summary: 'Remove one label, keeping every feature that was in it',
  security: GUARDED_SECURITY,
  request: { params: labelParams },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})
