import type { Folder } from './folder.js'
import type { Progress } from './progress.js'
import type { ShareLink } from './share-link.js'

/**
 * A task as the manifest knows it: the only home for its name and placement, plus the four
 * fields a list row renders that are cached from the task file (ADR 0034).
 */
export interface TaskEntry {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly folderId: string | null
  readonly progress: Progress
  readonly updatedAt: string
  readonly tabCount: number
  readonly tabNames: readonly string[]
}

/** Everything about a project except its tab documents. */
export interface ProjectManifest {
  readonly id: string
  readonly name: string
  readonly folders: readonly Folder[]
  readonly tasks: readonly TaskEntry[]
  readonly shareLinks: readonly ShareLink[]
  readonly createdAt: string
  readonly updatedAt: string
}
