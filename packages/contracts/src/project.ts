import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { Folder } from './folder.js'
import { ShareLink } from './share-link.js'
import { TaskEntry } from './task.js'

/** Everything about a project except its tab documents. */
export const ProjectManifest = z
  .object({
    id: EntityId,
    name: EntityName,
    folders: z.array(Folder).max(100),
    tasks: z.array(TaskEntry).max(500),
    shareLinks: z.array(ShareLink).max(50),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'ProjectManifest', description: 'A project manifest: folders, tasks and share links' })
