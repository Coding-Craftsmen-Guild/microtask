'use server'

import type { Decoded, NewShareLink, ShareLinkChange } from '@repo/api-client'
import type { ShareLink } from '@repo/contracts'
import { refresh } from 'next/cache'
import { linkCall } from './link-call'
import type { ActionResult } from './result'
import { changeOf, listedFor } from './share-link-parts'

type Link = Decoded<typeof ShareLink>

/**
 * The share links a `manage` link may list, token and all — asked for when its share manager
 * **opens**, never to render a page.
 *
 * The first argument of every action in this file is the caller's own share token, bound in by
 * the link page from its URL, and it is the whole credential (ADR 0040). The API answers the list
 * only to a `manage` link scoped to the whole project, because `share:read` is decided against the
 * project (ADR 0038); a task-scoped `manage` link is never shown a control that calls this.
 *
 * As on the admin surface, the links reach the browser only in the answer to this call, when the
 * dialog that exists to show them is opened — never in a page's HTML or Flight payload (ADR 0033).
 * `taskId` narrows the answer on the server to the links scoped to that task (`listedFor`).
 */
export async function listLinkShareLinks(
  token: string,
  projectId: string,
  taskId: string | null,
): Promise<ActionResult<readonly Link[]>> {
  return linkCall(token, async (api) => listedFor((await api.shareLinks.list(projectId)).shareLinks, taskId))
}

/** Mints a link through `token`, which becomes its parent in the revocation cascade (ADR 0010). */
export async function createLinkShareLink(
  token: string,
  projectId: string,
  seat: NewShareLink,
): Promise<ActionResult<Link>> {
  const result = await linkCall(token, (api) => api.shareLinks.create(projectId, seat))
  if (result.ok) refresh()
  return result
}

/**
 * Renames a link or changes its role through `token`, keeping the link's own token.
 *
 * `linkToken` is the link being changed and `token` the one presenting the request — two
 * different credentials, and only the second is authority. Only `name` and `role` are forwarded,
 * whatever else arrived (`changeOf`): scope is immutable (ADR 0011, ADR 0035).
 */
export async function updateLinkShareLink(
  token: string,
  projectId: string,
  linkToken: string,
  change: ShareLinkChange,
): Promise<ActionResult<Link>> {
  const result = await linkCall(token, (api) => api.shareLinks.update(projectId, linkToken, changeOf(change)))
  if (result.ok) refresh()
  return result
}

/** Revokes a link and every link minted through it, through `token`, answering the whole set. */
export async function revokeLinkShareLink(
  token: string,
  projectId: string,
  linkToken: string,
): Promise<ActionResult<readonly Link[]>> {
  const result = await linkCall(token, async (api) => {
    const { revoked } = await api.shareLinks.revoke(projectId, linkToken)
    return revoked
  })
  if (result.ok) refresh()
  return result
}
