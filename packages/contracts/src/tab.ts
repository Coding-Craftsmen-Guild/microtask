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

/**
 * What a conditional document write answers with: the stamp the **next** write must present.
 *
 * The tab is not echoed back. A client that just sent the document already has it, and the one
 * thing it cannot know is the version its save produced — which is precisely what the next
 * `If-Match` has to carry, including after a 409 reload (ADR 0016).
 */
export const TabDocumentSaved = z
  .object({ updatedAt: z.string() })
  .meta({ id: 'TabDocumentSaved', description: 'The stamp the next conditional write must match' })
