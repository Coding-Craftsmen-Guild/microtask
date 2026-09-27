import { createRoute } from '@hono/zod-openapi'
import {
  BindEpicPayload,
  BindProjectPayload,
  CreateEpicPayload,
  EpicPlacementPayload,
  UpdateEpicPayload,
} from '@repo/contracts'
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

/**
 * Bind one rail to a Microtask project by the share token an admin pasted. Answers the plan.
 *
 * `PUT`, because the body is the whole binding rather than a change to part of one: re-roling a rail
 * and re-pasting a rotated token for the same project are one operation from the store's point of
 * view, and there is no field of a binding it makes sense to change alone.
 *
 * The body is a token and a role and **no project**. The project is derived by resolving the token, so
 * the two can never disagree (`bridge/bindings.ts` argues it at length). `epic:bind` is in
 * `ADMIN_ONLY_ACTIONS`, so no seat reaches this route whatever its role: an epic's binding is the
 * ceiling on everything a link holder reaches in Microtask through the bridge, and a holder who could
 * re-role a binding could raise its own ceiling (spec §7.3).
 *
 * **422** for a token that names no project and for one weaker than the role asked for, which are two
 * different sentences an admin acts on differently.
 */
export const bindEpicRoute = createRoute({
  method: 'put',
  path: '/{epicId}/binding',
  tags: ['epics'],
  summary: 'Bind one rail to a Microtask project',
  security: GUARDED_SECURITY,
  request: {
    params: epicParams,
    body: { required: true, content: { 'application/json': { schema: BindEpicPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Unbind one rail. Answers the plan, and is idempotent on a rail that is bound to nothing.
 *
 * **Leaves every item's `linkedTaskId` in place.** A binding is permitted no delete (spec §7.2), and
 * clearing the links would be destruction the admin did not ask for — an admin who unbinds and rebinds
 * the same rail after rotating a revoked token finds every item still pointing at the task it did
 * before. Those links are inert while the rail is unbound: `bridge-view.ts` reports nothing for an item
 * whose rail did not resolve, and `planView` withholds the id from any reader below effective `write`.
 */
export const unbindEpicRoute = createRoute({
  method: 'delete',
  path: '/{epicId}/binding',
  tags: ['epics'],
  summary: 'Unbind one rail, leaving its items’ links in place',
  security: GUARDED_SECURITY,
  request: { params: epicParams },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})

/**
 * Bind one rail by **naming the project**, the API minting the seat itself. Answers the plan.
 *
 * ### Why this exists beside the route above it
 *
 * That one asks an admin to go to Microtask, mint a share link, copy its token, come back and paste it.
 * This one asks for the project and does the middle three steps on the server, so the credential is created,
 * sealed and stored inside one request and never enters a browser or a paste buffer.
 *
 * ### It adds no authority, and the two gates are why
 *
 * The handler asks `epic:bind` on the plan and then `share:create` on the named project — the same two calls
 * `bindEpic` and `createShareLink` already make, unchanged and in that order. ADR 0052 refused minting from
 * Macroplan on the premise that a Macroplan admin holds no Microtask seat; that is true of *seats* and beside
 * the point, because there is one admin across both products (ADR 0014) and that is exactly why 0052 could
 * tell the admin to mint the seat by hand. An admin who cannot mint there is refused here by the second gate.
 *
 * ### `POST`, where binding by token is `PUT`
 *
 * The difference is honest rather than stylistic: that route replaces a binding with the one the body
 * describes and is idempotent, where this one **creates a credential** in the other product on every call.
 * Two calls leave two seats over that project, of which the rail holds the later. That is a real consequence
 * and the method is what says so.
 *
 * **422** carries the same two refusals the pasted path answers, from the same comparison: the minted token is
 * resolved and role-checked like any other, so the stored project is derived rather than echoed back.
 */
export const bindProjectRoute = createRoute({
  method: 'post',
  path: '/{epicId}/binding/project',
  tags: ['epics'],
  summary: 'Bind one rail to a Microtask project, minting its seat server-side',
  security: GUARDED_SECURITY,
  request: {
    params: epicParams,
    body: { required: true, content: { 'application/json': { schema: BindProjectPayload } } },
  },
  responses: { 200: PLAN_RESPONSE, ...problemResponses() },
})
