import { createRoute } from '@hono/zod-openapi'
import {
  CreateItemPayload,
  DescriptionPayload,
  ItemPlacementPayload,
  ItemView,
  UpdateItemPayload,
} from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { itemParams, planParams } from '../params.js'
import { PLAN_RESPONSE } from '../plan-response.js'

/**
 * Add an item under a feature. Answers **200**, and the whole plan is the body.
 *
 * The item lands after the last one in its feature, and the feature's span grows by this item's
 * estimate: a feature with at least one estimated item is worth the sum of them, so adding one moves
 * everything after it on that rail and everything waiting on it across rails. That is the clearest
 * case for why this subtree answers the plan rather than the created thing.
 */
export const createItemRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['items'],
  summary: 'Add an item to the end of a feature',
  security: GUARDED_SECURITY,
  request: {
    params: planParams,
    body: { required: true, content: { 'application/json': { schema: CreateItemPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Read one item beside the description its own file holds.
 *
 * The one route in this subtree that answers something other than the plan, because the description
 * is the one thing a `PlanView` does not carry: descriptions live in a file per item, and folding
 * 2,000 of them into every plan response is the reason they are stored apart at all.
 *
 * An item created and never described answers `''` rather than 404 or `null`: absence of a file is
 * the ordinary case, and so is a file that will not decode — the item, its name and its estimate all
 * live in the manifest and read back fine either way.
 */
export const readItemRoute = createRoute({
  method: 'get',
  path: '/{itemId}',
  tags: ['items'],
  summary: 'Read one item and its description',
  security: GUARDED_SECURITY,
  request: { params: itemParams },
  responses: {
    200: {
      description: 'The item as stored, with the description its file holds',
      content: { 'application/json': { schema: ItemView } },
    },
    ...problemResponses(),
  },
})

/**
 * Rename one item, re-estimate it, or both, moving it nowhere.
 *
 * `UpdateItemPayload` declares `name` and `estimateDays` and nothing else, so a body naming
 * `linkedTaskId` has that key **stripped** by zod rather than honoured: the link to a Microtask task
 * is the bridge, spec §9 reserves it for phase 4, and nothing reachable from here may write one.
 *
 * `estimateDays` is nullable as well as optional, because zero is a real estimate — an item that
 * takes no time — so "no estimate yet" cannot be spelled as a falsy value.
 */
export const updateItemRoute = createRoute({
  method: 'patch',
  path: '/{itemId}',
  tags: ['items'],
  summary: 'Rename or re-estimate one item',
  security: GUARDED_SECURITY,
  request: {
    params: itemParams,
    body: { required: true, content: { 'application/json': { schema: UpdateItemPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/** Move one item inside its feature or under another, renumbering both groups densely. */
export const placeItemRoute = createRoute({
  method: 'patch',
  path: '/{itemId}/placement',
  tags: ['items'],
  summary: 'Move one item inside its feature or under another',
  security: GUARDED_SECURITY,
  request: {
    params: itemParams,
    body: { required: true, content: { 'application/json': { schema: ItemPlacementPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Replace one item's description. `PUT`, because the body is the whole text.
 *
 * The stored value is capped at `MAX_ITEM_DESCRIPTION_BYTES` in **UTF-8 bytes** by
 * `cleanDescription`, never cutting a code point in half. `DescriptionPayload` states no length of
 * its own, so the domain's byte cap is the only cap — which is the right way round: the contract's
 * `.max()` on a description elsewhere counts UTF-16 units and calls itself a backstop, and this repo
 * has already shipped that character-versus-byte mistake once.
 */
export const describeItemRoute = createRoute({
  method: 'put',
  path: '/{itemId}/description',
  tags: ['items'],
  summary: "Replace one item's description",
  security: GUARDED_SECURITY,
  request: {
    params: itemParams,
    body: { required: true, content: { 'application/json': { schema: DescriptionPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Remove one item and its file, renumbering what is left of its group densely.
 *
 * Its feature's span shrinks by exactly this item's estimate, so the plan that remains is again the
 * point rather than a 204.
 */
export const deleteItemRoute = createRoute({
  method: 'delete',
  path: '/{itemId}',
  tags: ['items'],
  summary: 'Remove one item and its description',
  security: GUARDED_SECURITY,
  request: { params: itemParams },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})
