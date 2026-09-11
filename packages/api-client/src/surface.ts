import { SearchResults, ShareView } from '@repo/contracts'
import { foldersApi, type FoldersApi } from './operations/folders.js'
import { projectsApi, type ProjectsApi } from './operations/projects.js'
import { shareLinksApi, type ShareLinksApi } from './operations/share-links.js'
import { tabsApi, type TabsApi } from './operations/tabs.js'
import { tasksApi, type TasksApi } from './operations/tasks.js'
import { CURRENT_SHARE_PATH, SEARCH_PATH } from './paths.js'
import type { Transport } from './transport.js'
import type { Decoded } from './types.js'

/**
 * Every operation this API serves, and the **same** set for both client kinds.
 *
 * The two clients differ by their brand and by nothing else. That is deliberate: which calls a
 * credential may actually make is decided by `AccessPolicy` inside the API, on a target built
 * from the request's own parameters, and a client that omitted `projects.create` for a link token
 * would be a second copy of that policy — one that can drift from the real one, that cannot see
 * the role a link carries, and that would have to be revised every time the policy is. ADR 0009
 * puts the decision in one place; this interface is what keeps it there.
 *
 * So a link client may *call* anything here. What it gets for a call outside its scope is a 403
 * from the one authority that knows, delivered as {@link ApiError} with `status` 403.
 */
export interface MicrotaskApi {
  /** Projects: the collection, and one at a time. */
  readonly projects: ProjectsApi

  /** Folders, which group a project's tasks one level deep. */
  readonly folders: FoldersApi

  /** Tasks, and where they sit. */
  readonly tasks: TasksApi

  /** Tabs and their documents, including the one conditional write in this API. */
  readonly tabs: TabsApi

  /** Share links: minting seats, listing them, and revoking a subtree of them. */
  readonly shareLinks: ShareLinksApi

  /**
   * Searches project, folder and task names across the product.
   *
   * Tab names and document text are not searched (ADR 0021). A term that reduces to nothing is a
   * well-formed question with no answer and comes back empty rather than matching everything.
   */
  search(term: string): Promise<Decoded<typeof SearchResults>>

  /**
   * Describes the share link the caller presented, and what it reaches.
   *
   * It sends no token in the path or in a header of its own — the answer is derived from the
   * bearer the transport already carries, which is what keeps a credential out of server logs
   * and out of the `Referer` of every link the page then renders (ADR 0013). An **admin** token
   * names no share link, so this answers 404 for one: not a refusal, simply nothing to describe.
   */
  currentShare(): Promise<Decoded<typeof ShareView>>
}

/** Binds every operation group to one transport, which is what a client is made of. */
export function createSurface(transport: Transport): MicrotaskApi {
  return {
    projects: projectsApi(transport),
    folders: foldersApi(transport),
    tasks: tasksApi(transport),
    tabs: tabsApi(transport),
    shareLinks: shareLinksApi(transport),
    search: (term) =>
      transport.json({ method: 'GET', path: SEARCH_PATH, query: { q: term } }, SearchResults),
    currentShare: () =>
      transport.json({ method: 'GET', path: CURRENT_SHARE_PATH }, ShareView),
  }
}
