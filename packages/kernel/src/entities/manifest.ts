import type { Folder } from './folder.js'
import type { Progress } from './progress.js'
import type { ShareLink } from './share-link.js'

/** A task as the manifest knows it. The only home for its name and placement. */
export interface TaskEntry {
  readonly id: string
  readonly name: string
  readonly position: number
  readonly folderId: string | null
  readonly progress: Progress
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
