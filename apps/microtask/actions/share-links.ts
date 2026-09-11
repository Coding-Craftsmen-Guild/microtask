'use server'

import type { Decoded, NewShareLink, ShareLinkChange } from '@repo/api-client'
import type { ShareLink } from '@repo/contracts'
import { refresh } from 'next/cache'
import { projectPagePath, taskPagePath } from '../components/projects/paths'
import { scopedToTask } from '../components/share-manager/task-share'
import { adminCall, type ActionResult } from './result'

type Link = Decoded<typeof ShareLink>

/**
 * The share links of one project, token and all — asked for when the share manager **opens**.
 *
 * This is the only way a token reaches the browser, and it is on demand: neither the project page
 * nor the task page renders the links, so no token is in their HTML or Flight payload, and one
 * reaches a browser only when an admin opens the dialog that exists to show it (ADR 0033).
 *
 * `taskId` is the task page's manager asking for the links scoped to its task, and the rest are
 * dropped **here**, on the server, so the dialog never holds a token it does not show. `null` is
 * the project page asking for every link. Either way it only narrows what the API answered.
 */
export async function listShareLinks(projectId: string, taskId: string | null): Promise<ActionResult<readonly Link[]>> {
  const page = taskId === null ? projectPagePath(projectId) : taskPagePath(projectId, taskId)
  return adminCall(page, async (api) => {
    const { shareLinks } = await api.shareLinks.list(projectId)
    return taskId === null ? shareLinks : shareLinks.filter((link) => scopedToTask(link.scope, taskId))
  })
}

/** Mints a seat and answers it: the one response that hands its token back unasked. */
export async function createShareLink(projectId: string, seat: NewShareLink): Promise<ActionResult<Link>> {
  const result = await adminCall(projectPagePath(projectId), (api) =>
    api.shareLinks.create(projectId, seat),
  )
  if (result.ok) refresh()
  return result
}

const changeOf = (sent: ShareLinkChange): ShareLinkChange => ({
  ...(sent.name !== undefined && { name: sent.name }),
  ...(sent.role !== undefined && { role: sent.role }),
})

/**
 * Renames a seat or changes its role, **keeping its token** so the client's URL still works.
 *
 * Only `name` and `role` are forwarded, whatever else arrived beside them: scope is immutable
 * (ADR 0011, ADR 0035). The API strips the rest too and stays the gate; this is so the request
 * this app sends says exactly what the UI asked for.
 */
export async function updateShareLink(
  projectId: string,
  token: string,
  change: ShareLinkChange,
): Promise<ActionResult<Link>> {
  const result = await adminCall(projectPagePath(projectId), (api) =>
    api.shareLinks.update(projectId, token, changeOf(change)),
  )
  if (result.ok) refresh()
  return result
}

/**
 * Revokes a seat and every seat minted through it, answering the whole set (ADR 0010).
 *
 * The set rather than the one token, so the manager can drop every row that went dark and say
 * how many did.
 */
export async function revokeShareLink(projectId: string, token: string): Promise<ActionResult<readonly Link[]>> {
  const result = await adminCall(projectPagePath(projectId), async (api) => {
    const { revoked } = await api.shareLinks.revoke(projectId, token)
    return revoked
  })
  if (result.ok) refresh()
  return result
}
