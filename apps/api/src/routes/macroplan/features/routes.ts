import { createRoute } from '@hono/zod-openapi'
import {
  CreateFeaturePayload,
  DependenciesPayload,
  FeaturePlacementPayload,
  UpdateFeaturePayload,
} from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { featureParams, planParams } from '../params.js'
import { PLAN_RESPONSE } from '../plan-response.js'

/**
 * Add a feature to a rail. Answers **200**, and the whole plan is the body.
 *
 * The feature lands after the last one on its rail, so the body names the rail and no position.
 * A rail that is not in this plan — a rail belonging to another plan included — is a **422** and not
 * a 404: the epic named here is a field of the body rather than the thing being addressed, and
 * ADR 0050 is the reason a cross-plan reference has to be refused rather than followed.
 */
export const createFeatureRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['features'],
  summary: 'Add a feature to the end of a rail',
  security: GUARDED_SECURITY,
  request: {
    params: planParams,
    body: { required: true, content: { 'application/json': { schema: CreateFeaturePayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Rename one feature, re-estimate it, re-pin it, or any combination, moving it nowhere.
 *
 * `estimateDays` and `pinSprint` are each nullable as well as optional: omitting one leaves it,
 * `null` clears it. Both distinctions are load-bearing — zero is a real estimate and sprint zero is
 * a real pin — so neither "not estimated yet" nor "not pinned" can be spelled as a falsy value.
 *
 * Clearing the estimate of a feature carrying no estimated items takes it off the axis: the response's
 * `schedule` reports it under `unscheduled` with `reason: 'no-estimate'` rather than drawing a bar at
 * a guessed width, and its rail neighbours close over it rather than being cut in two.
 */
export const updateFeatureRoute = createRoute({
  method: 'patch',
  path: '/{featureId}',
  tags: ['features'],
  summary: 'Rename, re-estimate or re-pin one feature',
  security: GUARDED_SECURITY,
  request: {
    params: featureParams,
    body: { required: true, content: { 'application/json': { schema: UpdateFeaturePayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Move one feature along its rail or onto another, renumbering both rails densely.
 *
 * The feature crosses whole: its estimate, its pin and its dependencies are none of them properties
 * of the rail it sat on. Nothing is rewritten to keep a dependency satisfied either — a feature
 * dragged ahead of something it waits on is a contradiction the forward pass reports in
 * `ignoredEdges`, and repairing it here is exactly the silent solver spec §6 refuses.
 */
export const placeFeatureRoute = createRoute({
  method: 'patch',
  path: '/{featureId}/placement',
  tags: ['features'],
  summary: 'Move one feature along its rail or onto another',
  security: GUARDED_SECURITY,
  request: {
    params: featureParams,
    body: { required: true, content: { 'application/json': { schema: FeaturePlacementPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Replace what one feature waits on. `PUT`, because the body is the whole edge list.
 *
 * Declares **409** beyond the common set: a body that would close a cycle is a conflict and not a
 * malformed request, and the detail names the features that would wait on each other. Nothing is
 * written — every check runs before the first store call — so a refused edge list leaves the plan
 * exactly as it was.
 *
 * A self-edge and an id naming a feature in another plan are both **422**, which is the same
 * distinction `POST /features` draws on its `epicId`: those ids are fields of the body, and an edge
 * may never leave the plan directory (spec §4.2, ADR 0050).
 */
export const setDependenciesRoute = createRoute({
  method: 'put',
  path: '/{featureId}/dependencies',
  tags: ['features'],
  summary: "Replace one feature's dependencies",
  security: GUARDED_SECURITY,
  request: {
    params: featureParams,
    body: { required: true, content: { 'application/json': { schema: DependenciesPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses([409]) },
})

/**
 * Remove one feature, the items under it and every edge that named it, in one write.
 *
 * The edge strip runs across every rail, because an edge left pointing at a feature that no longer
 * exists is one the pass drops silently — after which a bar is placed as though the dependency had
 * never been stated.
 */
export const deleteFeatureRoute = createRoute({
  method: 'delete',
  path: '/{featureId}',
  tags: ['features'],
  summary: 'Remove one feature and its items',
  security: GUARDED_SECURITY,
  request: { params: featureParams },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})
