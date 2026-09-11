import { z } from 'zod'
import { LIMITS } from './limits.js'
import { EntityId, EntityName } from './document.js'
import { Progress } from './progress.js'
import { Tab } from './tab.js'

/** A task as the manifest knows it. */
export const TaskEntry = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    folderId: EntityId.nullable(),
    progress: Progress,
  })
  .meta({ id: 'TaskEntry', description: 'A task as its project manifest records it' })

/** The contents of one task file. */
export const TaskDocument = z
  .object({
    id: EntityId,
    tabs: z.array(Tab).max(LIMITS.tabsPerTask),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'TaskDocument', description: 'One task file: its tabs and nothing else' })
