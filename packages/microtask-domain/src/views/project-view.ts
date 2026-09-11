import type { Principal } from '@repo/kernel'
import type { Folder } from '../entities/folder.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import { visibleFolders, visibleLinks, visibleTasks } from './view-mapper.js'

interface ProjectCore {
  readonly id: string
  readonly name: string
  readonly folders: readonly Folder[]
  readonly tasks: readonly TaskEntry[]
  readonly createdAt: string
  readonly updatedAt: string
}

/**
 * One project as a particular caller may be told about it.
 *
 * `shareLinks` is optional because an admin-only block that is refused is **absent**, not empty:
 * one route tree serves both an admin and a link holder (ADR 0013), and the representation a link
 * holder receives must not carry a field only an admin should see. Every other field is governed
 * by `project:read` on the project itself, which every principal reaching this view holds.
 */
export interface ProjectView extends ProjectCore {
  readonly shareLinks?: readonly ShareLink[]
}

/**
 * One project as a **list** may describe it: the same fields, with a count where the links were.
 *
 * `shareLinkCount` is present exactly when {@link ProjectView} would have carried `shareLinks`,
 * and it counts the same links — one decision, asked once, reused. An unconditional count would
 * tell a link principal how many seats exist on a project it can read, which is a disclosure the
 * app being replaced never made (ADR 0033).
 */
export interface ProjectListItem extends ProjectCore {
  readonly shareLinkCount?: number
}

const core = (manifest: ProjectManifest, principal: Principal): ProjectCore => ({
  id: manifest.id,
  name: manifest.name,
  folders: visibleFolders(manifest, principal),
  tasks: visibleTasks(manifest, principal),
  createdAt: manifest.createdAt,
  updatedAt: manifest.updatedAt,
})

/**
 * Shapes a project for whoever is asking, dropping everything the policy refuses them.
 *
 * Pure: a manifest and a principal in, a representation out. It calls `can()` through the mapper
 * and must — deciding whether this caller may be shown this folder, this task, this link is a
 * filter, and ADR 0009 requires a filter to ask the policy rather than restate it.
 */
export function projectView(manifest: ProjectManifest, principal: Principal): ProjectView {
  const links = visibleLinks(manifest, principal)
  const shown = core(manifest, principal)
  return links === undefined ? shown : { ...shown, shareLinks: links }
}

/**
 * Shapes a project for one row of a list: the same fields, with the links counted rather than
 * carried.
 *
 * It asks {@link visibleLinks} — the predicate {@link projectView} already asks — and reports
 * its length, so the count is present on exactly the responses the links would have been on and
 * no second decision exists to drift from the first (ADR 0033, ADR 0009).
 */
export function projectListItem(
  manifest: ProjectManifest,
  principal: Principal,
): ProjectListItem {
  const links = visibleLinks(manifest, principal)
  const shown = core(manifest, principal)
  return links === undefined ? shown : { ...shown, shareLinkCount: links.length }
}
