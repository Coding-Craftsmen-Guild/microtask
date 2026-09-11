'use client'

import { useImperativeHandle, useMemo, useState, type Ref } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { countTasks, type DocumentValue, type ProgressValue } from '@repo/contracts'
import { toContent, toDocument } from './document-json'
import { buildExtensions, editorProps } from './extensions'
import { LinkDialog } from './link-dialog'
import { SaveIndicator } from './save-indicator'
import type { SaveDocument } from './save-document'
import { Toolbar } from './toolbar'
import { useAutosave } from './use-autosave'

/**
 * What a parent may ask of the island, which is exactly the two things legacy's tab code did.
 *
 * Switching tab awaits `flush`, and leaves only if it answers `true`, so no edit is lost by
 * navigating. Deleting a tab calls `markClean` **before** the DELETE, so a queued autosave cannot
 * land afterwards and resurrect the content that was just removed.
 */
export interface DocumentEditorHandle {
  /**
   * Writes a pending edit now, and settles once the write has: `true` when nothing is left
   * unsaved, `false` when edits are held — refused as a conflict, or failed and waiting to retry.
   */
  flush: () => Promise<boolean>
  /** Drops a pending edit without writing it. */
  markClean: () => void
}

/** Props for {@link DocumentEditor}. */
export interface DocumentEditorProps {
  /** The handle a parent uses to flush before switching tab and to go quiet before a delete. */
  ref?: Ref<DocumentEditorHandle>
  /** The tab's stored document. Read on mount; key the island by tab id to switch tabs. */
  document: DocumentValue
  /** The tab's `updatedAt`, which the first write presents as its precondition (ADR 0016). */
  updatedAt: string
  /** Whether this viewer may write. Read on mount, as legacy's loaded UI did. */
  editable: boolean
  /** Writes the document. The route handler and its credentials are the caller's. */
  save: SaveDocument
  /**
   * Reloads the tab from the server. Offered after a conflict, never called unasked.
   *
   * The island reads `document` and `updatedAt` on mount only, so a reload re-mounts it: key it
   * on the tab id **and** the stamp, which then changes only when fresh data arrives — the
   * island tracks the stamps its own saves produce internally (ADR 0016).
   */
  onReload: () => void
  /** Called after every edit with the live count, which is what every progress bar shows. */
  onProgress?: (progress: ProgressValue) => void
}

/**
 * The checklist document editor: the one heavy client island in the app.
 *
 * `immediatelyRender: false` because otherwise Tiptap detects the App Router's server pass,
 * overrules the flag with an `SSR detected` warning and renders no editor there, and because it
 * selects the `Editor | null` overload of `useEditor` — which is what the first render really
 * is, so every child takes a nullable editor (ADR 0039, as amended: the server pass does not
 * throw).
 *
 * An edit is the only thing that writes. Mounting fires no update, so a stored document is held
 * byte-for-byte until the user changes it, and a read-only view registers no update handler at
 * all. Extensions and props are memoised on `editable`, because `useEditor` compares options by
 * identity on every render and would otherwise re-apply them to the view each time.
 */
export function DocumentEditor(props: DocumentEditorProps) {
  const { editable, onProgress } = props
  const autosave = useAutosave({ updatedAt: props.updatedAt, save: props.save, editable })
  const [linking, setLinking] = useState(false)
  const { flush, markClean } = autosave
  useImperativeHandle(props.ref, () => ({ flush, markClean }), [flush, markClean])
  const extensions = useMemo(() => buildExtensions(editable), [editable])
  const attributes = useMemo(() => editorProps(editable), [editable])
  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editorProps: attributes,
    content: toContent(props.document),
    editable,
    autofocus: false,
    ...(editable && {
      onUpdate: ({ editor: live }) => {
        const document_ = toDocument(live.getJSON())
        autosave.change(document_)
        onProgress?.(countTasks(document_))
      },
    }),
  })
  return (
    <div className="rounded-b-xl border border-t-0 bg-card">
      {editable ? (
        <div className="sticky top-0 z-[5] flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
          <Toolbar editor={editor} onLink={() => setLinking(true)} />
          <span className="flex-1" />
          <SaveIndicator message={autosave.message} onReload={props.onReload} onRetry={() => void autosave.retry()} state={autosave.state} />
        </div>
      ) : null}
      <EditorContent className="px-[26px] py-5 max-sm:px-4" editor={editor} />
      {editable ? <LinkDialog editor={editor} onClose={() => setLinking(false)} open={linking} /> : null}
    </div>
  )
}
