import type { TaskRef } from '@repo/api-client'
import { adminDocumentRoot } from '../tabs/save-tab'

/**
 * A share link's own page, `/s/<token>`: the task, or the task list, its scope resolves to
 * (ADR 0037).
 *
 * The token is encoded rather than trusted, as every id in a path is here. A real token needs no
 * encoding — it is `[A-Za-z0-9_-]` — which is the reason to do it: the one value that would need
 * it is the one that arrived from somewhere unexpected.
 */
export const linkPath = (token: string): string => `/s/${encodeURIComponent(token)}`

/** One task inside a project-scoped link, `/s/<token>/t/<taskId>` (ADR 0037). */
export const linkTaskPath = (token: string, taskId: string): string =>
  `${linkPath(token)}/t/${encodeURIComponent(taskId)}`

/**
 * Where a link page writes one task's tab documents: the admin route's path, under the token.
 *
 * The admin surface writes under `/api/…` with `mt_admin`; this surface writes to the same path
 * beneath `/s/<token>`, and the token in that path is the credential the route presents
 * (ADR 0040). One path shape for both, so the two routes cannot come to disagree about a tab.
 */
export const linkDocumentRoot = (token: string, ref: TaskRef): string => `${linkPath(token)}${adminDocumentRoot(ref)}`
