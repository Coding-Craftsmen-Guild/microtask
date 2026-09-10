import { z } from 'zod'
import { DocumentJson, EntityId, EntityName } from './document.js'

/** One tab inside a task. */
export const Tab = z
  .object({
    id: EntityId,
    name: EntityName,
    position: z.number().int().min(0),
    document: DocumentJson,
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'Tab', description: 'One tab inside a task, owning its own document' })
