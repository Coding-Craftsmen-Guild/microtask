export { emptyDocument } from '@repo/contracts'

/** A Tiptap/ProseMirror document, stored as JSON and never as HTML. */
export interface DocumentJson {
  readonly type: 'doc'
  readonly content?: readonly unknown[] | undefined
}
