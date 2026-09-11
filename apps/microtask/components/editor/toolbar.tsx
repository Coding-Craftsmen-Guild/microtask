'use client'

import type { MouseEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { TOOLBAR, type ActiveQuery, type ToolbarItem } from './toolbar-items'

const OFF =
  'min-w-8 rounded-lg border border-transparent px-2 py-1 text-[13px] text-foreground hover:bg-muted'

const ON = 'min-w-8 rounded-lg border border-brand bg-brand px-2 py-1 text-[13px] text-white'

const keepSelection = (event: MouseEvent): void => event.preventDefault()

const lit = (editor: Editor | null, query: ActiveQuery | undefined): boolean => {
  if (editor === null || query === undefined) return false
  return editor.isActive(query.name, query.attrs ?? {})
}

/** Props for {@link Toolbar}. */
export interface ToolbarProps {
  /** The editor the buttons drive, or `null` before `useEditor` has produced one. */
  editor: Editor | null

  /** Opens the link dialog. The toolbar never touches a link itself. */
  onLink: () => void
}

/**
 * Legacy's formatting toolbar, as React.
 *
 * The active state comes from {@link useEditorState}, and that is the point of this component.
 * Tiptap 3 defaults `shouldRerenderOnTransaction` to `false`, so legacy's pattern — refresh on
 * `onSelectionUpdate` and `onTransaction` — ported naively gives handlers that fire and buttons
 * that never light up, because nothing re-renders (ADR 0039). The selector returns one boolean
 * per entry and the hook's deep equality re-renders only when one of them flips.
 *
 * Each button `preventDefault`s its `mousedown`, so the click lands without the editor losing
 * its selection first; the command then runs off `chain().focus()`.
 */
export function Toolbar({ editor, onLink }: ToolbarProps) {
  const active = useEditorState({
    editor,
    selector: ({ editor: live }) =>
      TOOLBAR.map((entry) => entry !== 'separator' && lit(live, entry.active)),
  })
  const press = (item: ToolbarItem) => (): void => {
    if (item.run === 'link') onLink()
    else if (editor !== null) item.run(editor.chain().focus()).run()
  }
  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar">
      {TOOLBAR.map((entry, index) =>
        entry === 'separator' ? (
          <span className="mx-1 h-5 w-px bg-border" key={`separator-${String(index)}`} role="separator" />
        ) : (
          <button
            aria-pressed={active?.[index] === true}
            className={active?.[index] === true ? ON : OFF}
            key={entry.title}
            onClick={press(entry)}
            onMouseDown={keepSelection}
            style={entry.style}
            title={entry.title}
            type="button"
          >
            {entry.label}
          </button>
        ),
      )}
    </div>
  )
}
