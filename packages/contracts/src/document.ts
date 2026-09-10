import { z } from 'zod'

/** A ULID-shaped identifier. */
export const EntityId = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be a ULID')
  .meta({ id: 'EntityId', description: 'A ULID-shaped identifier' })

/** A share-link token. */
export const ShareToken = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/, 'must be a share token')
  .meta({ id: 'ShareToken', description: 'An opaque share-link token' })

/** A user-supplied name for a project, folder, task or tab. */
export const EntityName = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .meta({ id: 'EntityName', description: 'A display name, at most 80 characters' })

/** A Tiptap/ProseMirror document. */
export const DocumentJson = z
  .object({ type: z.literal('doc'), content: z.array(z.unknown()).optional() })
  .meta({ id: 'DocumentJson', description: 'A Tiptap document, stored as JSON and never as HTML' })
