import type { Decoded, ShareLinkChange } from '@repo/api-client'
import type { ShareLink } from '@repo/contracts'
import { scopedToTask } from '../components/share-manager/task-share'

type Link = Decoded<typeof ShareLink>

/**
 * The links a share manager is handed: every one for `null`, the project page's manager, and only
 * those scoped to `taskId` for a task page's.
 *
 * Narrowed **here**, on the server, by both surfaces' list actions and by the counts beside Share,
 * so a dialog never holds a token it does not show and the number beside Share is the number of
 * rows it opens on (ADR 0033). It only ever narrows what the API answered; the API is the gate.
 */
export const listedFor = (links: readonly Link[], taskId: string | null): readonly Link[] =>
  taskId === null ? links : links.filter((link) => scopedToTask(link.scope, taskId))

/**
 * The change a rename or role change forwards: `name` and `role`, and nothing else that arrived.
 *
 * Scope is immutable (ADR 0011, ADR 0035). The API strips the rest too and stays the gate; this
 * is so the request this app sends says exactly what the UI asked for, whichever surface sent it.
 */
export const changeOf = (sent: ShareLinkChange): ShareLinkChange => ({
  ...(sent.name !== undefined && { name: sent.name }),
  ...(sent.role !== undefined && { role: sent.role }),
})
