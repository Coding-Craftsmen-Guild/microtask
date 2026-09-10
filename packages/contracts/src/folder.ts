import { z } from 'zod'
import { EntityId, EntityName } from './document.js'

/** A one-level grouping of tasks inside a project. */
export const Folder = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Folder', description: 'A one-level grouping of tasks; folders never nest' })
