/** A Tiptap/ProseMirror document, stored as JSON and never as HTML. */
export interface DocumentJson {
  readonly type: 'doc'
  readonly content?: readonly unknown[] | undefined
}

/** Creates the document a new tab starts with. */
export const emptyDocument = (): DocumentJson => ({
  type: 'doc',
  content: [{ type: 'paragraph' }],
})
