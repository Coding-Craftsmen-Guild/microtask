import type { ProjectScope, Role } from '@repo/kernel'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { principalOf, visibleFolders, visibleTasks } from './view-mapper.js'

/**
 * What one share link is, and what it can reach: the answer `GET /shares/current` gives.
 *
 * It carries **no token**, its own included. The caller sent its token to ask the question, so
 * echoing it back tells nobody anything and only puts a live credential into another response
 * body — and having no token field at all is what makes "never another link's token" true by
 * construction rather than by filtering (ADR 0017).
 */
export interface ShareView {
  readonly role: Role
  readonly scope: ProjectScope
  readonly project: { readonly id: string; readonly name: string }
  readonly folders: readonly Folder[]
  readonly tasks: readonly TaskEntry[]
}

/**
 * Shapes the bootstrap answer for one link, as the principal that link acts as.
 *
 * Reach is decided by asking the policy about the link's own scope, so a task-scoped link is
 * told its one task and no folder, and a project-scoped link is told the tree. Pure.
 */
export function shareView(manifest: ProjectManifest, link: ShareLink): ShareView {
  const principal = principalOf(link)
  return {
    role: link.role,
    scope: link.scope,
    project: { id: manifest.id, name: manifest.name },
    folders: visibleFolders(manifest, principal),
    tasks: visibleTasks(manifest, principal),
  }
}
