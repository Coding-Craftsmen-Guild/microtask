import type { Decoded, NewShareLink, ShareLinkChange } from '@repo/api-client'
import type { Capabilities, ScopeValue, ShareLink } from '@repo/contracts'
import type { ActionResult } from '../../actions/result'

/** One share link as the manager holds it once opened — token included, and only then. */
export type Link = Decoded<typeof ShareLink>

/**
 * The share-link writes and the one read, each a Server Action the page hands in.
 *
 * A prop rather than an import for the reason `TreeActions` gives: the same manager renders for a
 * link holder with actions carrying that link's authority, so it never decides whose credential a
 * request goes out under.
 */
export interface ShareActions {
  /** Lists the links, token and all. Called when the dialog opens, never to render the page. */
  list: (projectId: string) => Promise<ActionResult<readonly Link[]>>
  /** Mints a link, answering it with its token. */
  create: (projectId: string, seat: NewShareLink) => Promise<ActionResult<Link>>
  /** Renames a link or changes its role, keeping its token. */
  update: (projectId: string, token: string, change: ShareLinkChange) => Promise<ActionResult<Link>>
  /** Revokes a link and every link minted through it, answering the whole set. */
  revoke: (projectId: string, token: string) => Promise<ActionResult<readonly Link[]>>
}

/** Which share-manager controls to draw — rendering answers, never gates (ADR 0038). */
export interface ShareControls {
  /** Listing the links, which is what opening the manager does. */
  readonly read: boolean
  /** Minting a link. */
  readonly create: boolean
  /** Renaming a link or changing its role. */
  readonly update: boolean
  /** Revoking a link. */
  readonly revoke: boolean
}

/**
 * The share controls, from the capability record.
 *
 * The four answers genuinely differ: `share:create` is decided against the new link's own scope
 * while the other three are decided against the project, so a task-scoped `manage` holder can
 * mint a link it can then neither list, rename nor revoke (ADR 0038). Drawing from role would
 * show that holder a manager that 403s the moment it opens.
 */
export const shareControls = (can: Capabilities): ShareControls => ({
  read: can['share:read'],
  create: can['share:create'],
  update: can['share:update'],
  revoke: can['share:revoke'],
})

/** One scope a new link may be minted over, as the create form offers it. */
export interface ScopeChoice {
  /** The option's value: a task id, or `project`. */
  readonly value: string
  /** What the option says: the task's name, or `Whole project`. */
  readonly label: string
  /** The scope it mints. */
  readonly scope: ScopeValue
}
