import { z } from 'zod'
import { LIMITS } from './limits.js'

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
  .max(LIMITS.nameLength)
  .meta({ id: 'EntityName', description: `A display name, at most ${String(LIMITS.nameLength)} characters` })

/**
 * A Tiptap/ProseMirror document.
 *
 * `content` is declared `readonly` to match the entity the domain hands back. The distinction is
 * TypeScript-only and generates the same JSON Schema, but without it every route returning a tab
 * has to copy or cast the document it was given — and a cast at that seam would be hiding the one
 * thing worth checking, that the API's declared shape and the domain's are the same shape.
 */
export const DocumentJson = z
  .object({ type: z.literal('doc'), content: z.array(z.unknown()).readonly().optional() })
  .meta({ id: 'DocumentJson', description: 'A Tiptap document, stored as JSON and never as HTML' })
