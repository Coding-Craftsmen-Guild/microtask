import { z } from 'zod'
import { LIMITS } from './limits.js'
import { EntityId, EntityName } from './document.js'
import { Folder } from './folder.js'
import { ShareLink } from './share-link.js'
import { TaskEntry } from './task.js'

/** Everything about a project except its tab documents. */
export const ProjectManifest = z
  .object({
    id: EntityId,
    name: EntityName,
    folders: z.array(Folder).max(LIMITS.foldersPerProject),
    tasks: z.array(TaskEntry).max(LIMITS.tasksPerProject),
    shareLinks: z.array(ShareLink).max(LIMITS.shareLinksPerProject),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'ProjectManifest', description: 'A project manifest: folders, tasks and share links' })
