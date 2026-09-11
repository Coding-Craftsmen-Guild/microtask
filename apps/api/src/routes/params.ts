import { z } from '@hono/zod-openapi'
import { EntityId, ShareToken } from '@repo/contracts'

/**
 * The parameters of a route mounted under `/projects/{projectId}`.
 *
 * Every builder below extends this one rather than declaring its own `projectId`, because a
 * parameter that exists only on a parent's mount path is **not emitted**: a child declaring only
 * `taskId` produced `parameters: [{"name":"taskId"}]` for the path
 * `/projects/{projectId}/tasks/{taskId}`, so the document told a client a segment it must supply
 * does not exist. Redeclaring is also what validates it — a route that does not name `projectId`
 * has no validated value to build an authorization target from, and the target is what the whole
 * policy decides on.
 */
export const projectParams = z.object({ projectId: EntityId })

/** A route under `/projects/{projectId}/folders/{folderId}`. */
export const folderParams = projectParams.extend({ folderId: EntityId })

/** A route under `/projects/{projectId}/tasks/{taskId}`. */
export const taskParams = projectParams.extend({ taskId: EntityId })

/** A route under `/projects/{projectId}/tasks/{taskId}/tabs/{tabId}`. */
export const tabParams = taskParams.extend({ tabId: EntityId })

/**
 * A route under `/projects/{projectId}/share-links/{token}`.
 *
 * The one address in this tree that is not a ULID: a link is named by the token it hands out, so
 * revoking one needs no second identifier. That token is a path segment here because it names the
 * link being acted on, never the caller — the caller's own credential stays in the `Authorization`
 * header, which is what keeps it out of server logs and `Referer` (ADR 0013).
 */
export const shareLinkParams = projectParams.extend({ token: ShareToken })
