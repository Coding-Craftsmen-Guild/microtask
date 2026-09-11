import { can, type Action, type Principal, type Target } from '@repo/kernel'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'

/**
 * Something a view is about to show, put to the policy before it is shown.
 *
 * A share link appears here as the link itself rather than as its token, because the question
 * the policy answers is about where that link reaches — which is its scope, and nothing a view
 * should restate (ADR 0011).
 */
export type Viewable =
  | { readonly kind: 'share-links'; readonly projectId: string }
  | { readonly kind: 'share-link'; readonly link: ShareLink }
  | { readonly kind: 'folder'; readonly projectId: string }
  | { readonly kind: 'task'; readonly projectId: string; readonly taskId: string }

/** The question a viewable is put to the policy as. */
export interface Clearance {
  readonly action: Action
  readonly target: Target
}

/**
 * The action and target a viewable is cleared against, so the policy decides and nothing here
 * does.
 *
 * The block of share links is a project-level disclosure, so it asks about the project. One
 * particular link asks about that link's **own scope** as the target, which is what makes "a
 * `manage` holder sees links for its own scope only" fall out of `withinTaskScope` rather than
 * being written twice. A folder asks `project:read` on a `folder` target, the one a task scope
 * refuses outright — the reason a task-scoped link has no breadcrumb (ADR 0011).
 */
export function clearance(viewable: Viewable): Clearance {
  if (viewable.kind === 'share-links') {
    return { action: 'share:read', target: { kind: 'project', projectId: viewable.projectId } }
  }
  if (viewable.kind === 'share-link') {
    return { action: 'share:read', target: viewable.link.scope }
  }
  if (viewable.kind === 'folder') {
    return { action: 'project:read', target: { kind: 'folder', projectId: viewable.projectId } }
  }
  return {
    action: 'task:read',
    target: { kind: 'task', projectId: viewable.projectId, taskId: viewable.taskId },
  }
}

/**
 * Whether this principal may be shown this.
 *
 * Asks `can()` once per candidate rather than restating scope containment. Shaping a response is
 * a filter and not a gate, so calling `can()` here is what ADR 0009 asks for — the API's one
 * `authorize()` still owns the gate.
 */
export function visibleTo(principal: Principal, viewable: Viewable): boolean {
  const { action, target } = clearance(viewable)
  return can(principal, action, target)
}

/** The principal a share link acts as, so a view can shape a project for the link holding it. */
export function principalOf(link: ShareLink): Principal {
  return { kind: 'link', role: link.role, scope: link.scope, token: link.token }
}

/**
 * The folders this principal may be told about — all of them, or none.
 *
 * A `folder` target carries no folder id, so the policy answers for the whole tree at once. That
 * is the kernel's shape rather than a shortcut taken here.
 */
export function visibleFolders(
  manifest: ProjectManifest,
  principal: Principal,
): readonly Folder[] {
  return visibleTo(principal, { kind: 'folder', projectId: manifest.id }) ? manifest.folders : []
}

/** The task entries this principal may be told about, in the order the manifest holds them. */
export function visibleTasks(
  manifest: ProjectManifest,
  principal: Principal,
): readonly TaskEntry[] {
  return manifest.tasks.filter((task) =>
    visibleTo(principal, { kind: 'task', projectId: manifest.id, taskId: task.id }),
  )
}

/**
 * The share links this principal may be told about, or `undefined` when the block itself is
 * refused.
 *
 * Two decisions, not one: whether a caller may be told that this project has sharing at all, and
 * then which of its links it may see. Refusing the block returns `undefined` rather than an empty
 * array so a caller cannot read "none exist" out of "you may not ask" — and so an export bundle's
 * credential dump cannot arrive as an empty-looking field (ADR 0017).
 */
export function visibleLinks(
  manifest: ProjectManifest,
  principal: Principal,
): readonly ShareLink[] | undefined {
  if (!visibleTo(principal, { kind: 'share-links', projectId: manifest.id })) return undefined
  return manifest.shareLinks.filter((link) => visibleTo(principal, { kind: 'share-link', link }))
}
