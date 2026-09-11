import type { JSONContent } from '@tiptap/core'
import type { DocumentValue } from '@repo/contracts'

/**
 * A stored document, as the content `useEditor` is seeded with.
 *
 * The one seam where the contract's shape meets Tiptap's. They are the same JSON; they differ
 * only in that the contract declares `content` readonly, which is TypeScript-only (see
 * `DocumentJson` in `@repo/contracts`). Kept here so the cast is written once and nowhere else.
 */
export const toContent = (document: DocumentValue): JSONContent => document as JSONContent

/**
 * What the editor holds, as the document a save sends.
 *
 * `getJSON()` is typed with an optional, open `type` because Tiptap cannot know the root's name
 * statically; the root here is always `doc`, because that is the name of the only top node the
 * schema in `buildExtensions` has.
 */
export const toDocument = (content: JSONContent): DocumentValue => content as DocumentValue
