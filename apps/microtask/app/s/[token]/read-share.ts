import type { Decoded } from '@repo/api-client'
import type { ShareView, TaskView } from '@repo/contracts'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { linkCall, linkRead } from '../../../actions/link-call'
import type { ActionResult } from '../../../actions/result'
import { scopedToTask } from '../../../components/share-manager/task-share'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

/** What a link page renders from: what its token reaches, or the sentence the API refused with. */
export type ShareRead = ActionResult<Decoded<typeof ShareView>>

/** One task as a link page renders it, or the sentence the API refused it with. */
export type LinkTaskRead = ActionResult<Decoded<typeof TaskView>>

const NOT_FOUND = 404

/**
 * Asks the API what this URL's token reaches: the bootstrap call every `/s/<token>` page makes
 * first, once per request.
 *
 * The token comes from the route's own `params` and is the only credential presented (ADR 0040).
 * A token that cannot be one, and a 401 for one that no longer names a seat, go to the terminal
 * page through `linkCall`. So does a 404: the API answers it when the link was revoked between
 * resolving the token and reading it back, the same dead link by a narrower path.
 *
 * Wrapped in React's `cache` so `generateMetadata` and the page share one read.
 */
export const readShare = cache(async (token: string): Promise<ShareRead> => {
  const result = await linkCall(token, (api) => api.currentShare())
  if (!result.ok && result.status === NOT_FOUND) redirect(LINK_UNAVAILABLE_PATH)
  return result
})

/**
 * Reads one task through this URL's token, once per request.
 *
 * A task the API does not hold, or an id that is not one, is the route's not-found page; the API
 * refuses a task outside the token's scope before either, and the pages never ask it one.
 */
export const readLinkTask = cache(
  async (token: string, projectId: string, taskId: string): Promise<LinkTaskRead> =>
    linkRead(token, (api) => api.tasks.read({ projectId, taskId })),
)

/**
 * How many links the Share count beside a `manage` link's Share should say, reduced on the
 * server to a number so the page is handed no token (ADR 0033).
 *
 * Asked only when the holder may list links at all — `capabilities()['share:read']`, which a
 * task-scoped `manage` link is refused (ADR 0038) — and `undefined` whenever the answer is not a
 * number the holder may be told: the manager then says nothing rather than a claim.
 */
export async function readLinkShareCount(
  token: string,
  projectId: string,
  taskId: string | null,
): Promise<number | undefined> {
  const result = await linkCall(token, async (api) => {
    const { shareLinks } = await api.shareLinks.list(projectId)
    return taskId === null ? shareLinks.length : shareLinks.filter((link) => scopedToTask(link.scope, taskId)).length
  })
  return result.ok ? result.value : undefined
}
