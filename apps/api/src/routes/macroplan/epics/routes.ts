import { createRoute } from '@hono/zod-openapi'
import { CreateEpicPayload, EpicPlacementPayload, UpdateEpicPayload } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { epicParams, planParams } from '../params.js'
import { PLAN_RESPONSE } from '../plan-response.js'

/**
 * Add a rail to a plan. Answers **200**, and the whole plan is the body.
 *
 * 200 rather than 201 because the body is the plan and not the rail: `PLAN_RESPONSE` records why
 * every route in this subtree answers that way, and why it differs from `POST /plans` beside it.
 *
 * The rail lands at the bottom and the body carries no placement at all — work is added in the order
 * it is discovered (spec §6), and moving a rail afterwards is the placement route below.
 */
export const createEpicRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['epics'],
  summary: 'Add a rail at the bottom of a plan',
  security: GUARDED_SECURITY,
  request: {
    params: planParams,
    body: { required: true, content: { 'application/json': { schema: CreateEpicPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Rename one rail, recolour it, or both, moving nothing on it.
 *
 * `UpdateEpicPayload` declares `name` and `colour` and nothing else, so a body naming `binding` has
 * that key **stripped** by zod rather than honoured: an epic's binding is the ceiling on what a link
 * holder reaches in Microtask through the bridge, raising it is the admin-only `epic:bind`, and
 * phase 4 is what writes it (spec §9). It refuses an empty body, so a request asking for nothing is
 * a 422 rather than a write that stamps `updatedAt` and changes nothing.
 */
export const updateEpicRoute = createRoute({
  method: 'patch',
  path: '/{epicId}',
  tags: ['epics'],
  summary: 'Rename or recolour one rail',
  security: GUARDED_SECURITY,
  request: {
    params: epicParams,
    body: { required: true, content: { 'application/json': { schema: UpdateEpicPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Move one rail to a rail order, renumbering the rails densely.
 *
 * Its own path segment rather than a key on the `PATCH` above, because reordering is a different
 * authority from renaming: `epic:reorder` against `epic:rename`. The features on every rail keep the
 * positions they had — a rail order says where a lane is drawn, and nothing inside a lane depends on
 * which lane it is — so the spans in the response move only if a rail's contents did.
 */
export const placeEpicRoute = createRoute({
  method: 'patch',
  path: '/{epicId}/placement',
  tags: ['epics'],
  summary: 'Move one rail among its siblings',
  security: GUARDED_SECURITY,
  request: {
    params: epicParams,
    body: { required: true, content: { 'application/json': { schema: EpicPlacementPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Remove one rail, the features on it and the items under those, in one write.
 *
 * Answers the plan rather than 204, because the plan that remains is the point: a cascade this wide
 * re-derives every span, and a client handed 204 would have to fetch the timeline back immediately.
 */
export const deleteEpicRoute = createRoute({
  method: 'delete',
  path: '/{epicId}',
  tags: ['epics'],
  summary: 'Remove one rail and everything on it',
  security: GUARDED_SECURITY,
  request: { params: epicParams },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})
