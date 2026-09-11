import { createRoute } from '@hono/zod-openapi'
import {
  CreateShareLinkPayload,
  RevokedShareLinks,
  ShareLink,
  ShareLinkList,
  UpdateShareLinkPayload,
} from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'
import { projectParams, shareLinkParams } from '../../params.js'

/**
 * List the project's share links, in the order they were minted.
 *
 * Gated on the project, and unfiltered as a result: every principal `share:read` clears on a
 * project target is also cleared on each individual link in it, because a project scope contains
 * every scope inside that project. So "who may see this list" and "which of its rows they may
 * see" have the same answer here, and a second per-row filter would be a predicate that can
 * never remove anything. A holder scoped to one task fails the gate instead — this collection
 * names sibling tasks, which is exactly what a task scope must not learn (ADR 0011).
 */
export const listShareLinksRoute = createRoute({
  method: 'get',
  path: '/',
  tags: ['share-links'],
  summary: "List a project's share links",
  security: GUARDED_SECURITY,
  request: { params: projectParams },
  responses: {
    200: {
      description: 'Every share link the project holds, in minting order',
      content: { 'application/json': { schema: ShareLinkList } },
    },
    ...problemResponses(),
  },
})

/**
 * Mint a share link. Answers **201**, and the body is the only place its token is ever shown.
 *
 * Gated on the scope being minted rather than on the project in the path, which is what lets a
 * `manage` holder scoped to one task share that task further while refusing it a project-wide
 * link: the policy answers both from the same pairing the views use for a link they are about to
 * show. The scope is derived from the **validated body** and nothing is read before the gate, so
 * a refused caller learns nothing about what the project contains.
 */
export const createShareLinkRoute = createRoute({
  method: 'post',
  path: '/',
  tags: ['share-links'],
  summary: 'Mint a share link',
  security: GUARDED_SECURITY,
  request: {
    params: projectParams,
    body: { required: true, content: { 'application/json': { schema: CreateShareLinkPayload } } },
  },
  responses: {
    201: {
      description: 'The link as minted, carrying the token it hands out',
      content: { 'application/json': { schema: ShareLink } },
    },
    ...problemResponses(),
  },
})

/**
 * Revoke a share link and everything minted through it (ADR 0010).
 *
 * The token is a path segment because it names the link being cut, never the caller — the
 * caller's own credential stays in the `Authorization` header, which is what keeps it out of
 * server logs and `Referer` (ADR 0013).
 *
 * Gated on the project, before the store is asked whether that token exists. Deriving the target
 * from the link instead would mean reading it first, and this would become the one route in the
 * tree that answers 404 ahead of 403 — telling a caller the policy refuses that a token, or a
 * project, is real.
 */
export const revokeShareLinkRoute = createRoute({
  method: 'delete',
  path: '/{token}',
  tags: ['share-links'],
  summary: 'Revoke a share link and its descendants',
  security: GUARDED_SECURITY,
  request: { params: shareLinkParams },
  responses: {
    200: {
      description: 'Every link this revocation removed',
      content: { 'application/json': { schema: RevokedShareLinks } },
    },
    ...problemResponses(),
  },
})

/**
 * Rename a share link or change its role. The token does **not** change (ADR 0035).
 *
 * That continuity is the whole reason this route exists rather than revoke-and-recreate: a new
 * token breaks the URL the client has bookmarked, and for a role change the effect would be "this
 * client is locked out until I email them a new link" rather than "this client now reads only".
 *
 * Gated `share:update` on the **project**, alongside `share:read` and `share:revoke` — the three
 * things that operate on a project's set of links rather than on a link being minted. So a
 * task-scoped `manage` holder is refused, exactly as it is refused the list and the revoke, and
 * its own minted links are rename-able only by a project-scoped holder or the admin. That
 * asymmetry is inherited from scope containment rather than introduced here (ADR 0038).
 *
 * Gated before the store is asked whether the token exists, like the revoke beside it: deriving
 * the target from the link would mean reading it first, and this would become a route that
 * answers 404 ahead of 403 — telling a caller the policy refuses that a token, or a project, is
 * real.
 *
 * The body cannot carry a scope. A `manage` holder that could widen a link in place would have an
 * escalation path the policy never agreed to, which is the immutability ADR 0011 is about.
 */
export const updateShareLinkRoute = createRoute({
  method: 'patch',
  path: '/{token}',
  tags: ['share-links'],
  summary: 'Rename a share link or change its role',
  security: GUARDED_SECURITY,
  request: {
    params: shareLinkParams,
    body: { required: true, content: { 'application/json': { schema: UpdateShareLinkPayload } } },
  },
  responses: {
    200: {
      description: 'The link as it now is, carrying the token it already had',
      content: { 'application/json': { schema: ShareLink } },
    },
    ...problemResponses(),
  },
})
