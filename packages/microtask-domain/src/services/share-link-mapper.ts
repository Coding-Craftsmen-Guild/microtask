import { Invalid, NotFound, type ProjectScope, type Role } from '@repo/kernel'
import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { pickTask } from './task-mapper.js'

/**
 * The part of a request that decides what a link reaches, and nothing else.
 *
 * Separated from {@link ShareLinkRequest} so a caller that has to know the scope *before* it
 * mints — an API gating the request on the thing being shared — can ask {@link requestedScope}
 * without first assembling a whole request it does not have yet.
 *
 * Both members spell `| undefined` rather than relying on the `?` alone, because under
 * `exactOptionalPropertyTypes` a validated body infers `scope?: ProjectScope | undefined` and would
 * otherwise not be assignable here. Present-and-undefined means the same thing as absent for
 * both of them.
 */
export interface ScopeRequest {
  /** The task a link with no explicit scope is confined to. */
  readonly taskId?: string | undefined

  /**
   * Where the link reaches. Omitted, it is the task `taskId` names.
   *
   * A project spans clients (ADR 0004), so a project-wide link can expose one client's work to
   * another; task is therefore the default and the wider scope is the one that has to be asked
   * for by name (ADR 0011).
   */
  readonly scope?: ProjectScope | undefined
}

/** What a caller asks for when it mints a share link. */
export interface ShareLinkRequest extends ScopeRequest {
  /** Who the link is for, as the admin will recognise it in the list. */
  readonly name: string

  /** The authority the link carries. */
  readonly role: Role

  /** The token of the link minting this one, or null when the admin is minting it (ADR 0010). */
  readonly createdBy: string | null
}

/** Finds one share link by its token, or throws NotFound. */
export function pickLink(manifest: ProjectManifest, token: string): ShareLink {
  const found = manifest.shareLinks.find((link) => link.token === token)
  if (found === undefined) throw new NotFound('Share link not found')
  return found
}

/** The scope a request asks for, defaulting to the task it names rather than to the project. */
export function requestedScope(projectId: string, request: ScopeRequest): ProjectScope {
  if (request.scope !== undefined) return request.scope
  if (request.taskId === undefined) throw new Invalid('A share link needs a task or a scope')
  return { kind: 'task', projectId, taskId: request.taskId }
}

/**
 * Throws unless the scope names something inside this project.
 *
 * Containment is checked when the link is minted rather than only when it is used: a link
 * scoped into another project would otherwise sit in this manifest, resolve through this
 * project's tokens, and hand its holder a scope no check here had ever agreed to (ADR 0011).
 */
export function assertContained(manifest: ProjectManifest, scope: ProjectScope): void {
  if (scope.projectId !== manifest.id) {
    throw new Invalid('A share link cannot be scoped outside its project')
  }
  if (scope.kind === 'task') pickTask(manifest, scope.taskId)
}

/**
 * What a caller may change about a link that already exists (ADR 0035).
 *
 * Closed to `name` and `role`, and that is the decision rather than a partial of the link.
 * `scope` decides *what* a link reaches and a project scope can expose one client's work to
 * another, so it stays immutable and changing it is revoke-and-reissue (ADR 0011). `createdBy`
 * stays too, so the revocation cascade keeps describing the lineage a link was minted through
 * rather than the role it now holds (ADR 0010).
 *
 * Both members spell `| undefined` rather than relying on the `?` alone, because under
 * `exactOptionalPropertyTypes` a validated body infers `role?: Role | undefined` and would
 * otherwise not be assignable here.
 */
export interface ShareLinkChange {
  /**
   * The new display name, or absent to leave it.
   *
   * An **empty** name is a change and not an omission: production data already holds one, and the
   * app being replaced rendered it as "Unnamed link". A new link still requires a name, so the
   * two requests genuinely differ.
   */
  readonly name?: string | undefined

  /** The new authority, or absent to leave it. */
  readonly role?: Role | undefined
}

/**
 * Applies a change to a link, leaving its token, scope, lineage and minting time alone.
 *
 * Spelled field by field rather than as a spread of the change, so a member the payload schema
 * fails to strip cannot reach the stored link — the immutability in ADR 0011 is what stops a
 * `manage` holder widening its own authority in place, and a blind spread would put that one
 * careless schema edit away.
 */
export function changed(link: ShareLink, change: ShareLinkChange, name?: string): ShareLink {
  return {
    ...link,
    name: name ?? link.name,
    role: change.role ?? link.role,
  }
}

/** Puts one changed link back, leaving every other link in minting order. */
export function withLink(
  links: readonly ShareLink[],
  next: ShareLink,
): readonly ShareLink[] {
  return links.map((link) => (link.token === next.token ? next : link))
}

/** Builds a link over a token the id generator minted. */
export function newLink(
  token: string,
  request: ShareLinkRequest,
  scope: ProjectScope,
  stamp: string,
): ShareLink {
  return {
    token,
    name: request.name,
    role: request.role,
    scope,
    createdBy: request.createdBy,
    createdAt: stamp,
  }
}

/**
 * Every token revoked along with `token`: the link itself and each link descended from it
 * through `createdBy`, transitively (ADR 0010).
 *
 * The walk is a frontier over a set rather than a recursion, because `createdBy` is stored data
 * and an imported or hand-edited bundle can carry a cycle in it (ADR 0017). A token already
 * revoked is never expanded again, so a cycle ends the walk instead of ending the stack.
 */
export function revokedBy(links: readonly ShareLink[], token: string): ReadonlySet<string> {
  const revoked = new Set([token])
  const frontier = [token]
  for (const parent of frontier) {
    for (const link of links) {
      if (link.createdBy !== parent || revoked.has(link.token)) continue
      revoked.add(link.token)
      frontier.push(link.token)
    }
  }
  return revoked
}

/** Splits the links into the ones a revocation keeps and the ones it takes, in minting order. */
export function partition(
  links: readonly ShareLink[],
  revoked: ReadonlySet<string>,
): { readonly kept: readonly ShareLink[]; readonly gone: readonly ShareLink[] } {
  return {
    kept: links.filter((link) => !revoked.has(link.token)),
    gone: links.filter((link) => revoked.has(link.token)),
  }
}
