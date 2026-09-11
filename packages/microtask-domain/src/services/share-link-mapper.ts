import { Invalid, NotFound, type Role, type Scope } from '@repo/kernel'
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
 * `exactOptionalPropertyTypes` a validated body infers `scope?: Scope | undefined` and would
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
  readonly scope?: Scope | undefined
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
export function requestedScope(projectId: string, request: ScopeRequest): Scope {
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
export function assertContained(manifest: ProjectManifest, scope: Scope): void {
  if (scope.projectId !== manifest.id) {
    throw new Invalid('A share link cannot be scoped outside its project')
  }
  if (scope.kind === 'task') pickTask(manifest, scope.taskId)
}

/** Builds a link over a token the id generator minted. */
export function newLink(
  token: string,
  request: ShareLinkRequest,
  scope: Scope,
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
