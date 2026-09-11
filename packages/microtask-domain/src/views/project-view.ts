import type { Principal } from '@repo/kernel'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { visibleFolders, visibleLinks, visibleTasks } from './view-mapper.js'

/**
 * One project as a particular caller may be told about it.
 *
 * `shareLinks` is optional because an admin-only block that is refused is **absent**, not empty:
 * one route tree serves both an admin and a link holder (ADR 0013), and the representation a link
 * holder receives must not carry a field only an admin should see. Every other field is governed
 * by `project:read` on the project itself, which every principal reaching this view holds.
 */
export interface ProjectView {
  readonly id: string
  readonly name: string
  readonly folders: readonly Folder[]
  readonly tasks: readonly TaskEntry[]
  readonly shareLinks?: readonly ShareLink[]
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * Shapes a project for whoever is asking, dropping everything the policy refuses them.
 *
 * Pure: a manifest and a principal in, a representation out. It calls `can()` through the mapper
 * and must — deciding whether this caller may be shown this folder, this task, this link is a
 * filter, and ADR 0009 requires a filter to ask the policy rather than restate it.
 */
export function projectView(manifest: ProjectManifest, principal: Principal): ProjectView {
  const links = visibleLinks(manifest, principal)
  const shown = {
    id: manifest.id,
    name: manifest.name,
    folders: visibleFolders(manifest, principal),
    tasks: visibleTasks(manifest, principal),
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  }
  return links === undefined ? shown : { ...shown, shareLinks: links }
}
