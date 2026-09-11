import type { CSSProperties } from 'react'
import type { ChainedCommands } from '@tiptap/core'

/** What `editor.isActive` is asked to decide whether a button is lit. */
export interface ActiveQuery {
  /** A mark or node name. */
  readonly name: string

  /** Attributes that must match too, which is how three heading buttons stay distinct. */
  readonly attrs?: Record<string, unknown>
}

/** One toolbar button. */
export interface ToolbarItem {
  /** The glyph, which is the whole of the button's visible content. */
  readonly label: string

  /** The `title` tooltip, carried over from legacy verbatim. */
  readonly title: string

  /** An inline style legacy set so the glyph shows what the button does. */
  readonly style?: CSSProperties

  /**
   * What lights the button up, or absent for one that never does.
   *
   * `Divider` is the absent case: it inserts a `horizontalRule` and has no mark or node the
   * caret can be inside, so legacy's version never lit either. That is not a bug to fix.
   */
  readonly active?: ActiveQuery

  /** The command, off an already-focused chain, or `'link'` for the dialog button. */
  readonly run: ((chain: ChainedCommands) => ChainedCommands) | 'link'
}

/** A button, or the 1px rule legacy drew between groups. */
export type ToolbarEntry = ToolbarItem | 'separator'

/**
 * The toolbar, in legacy's order, with legacy's tooltips.
 *
 * A table rather than JSX so the order, the tooltips and the active queries are one list a test
 * can read — the thing that made legacy's toolbar hard to check was that all three facts were
 * spread across a builder function.
 *
 * There is no `Mod-k` entry, because legacy had no link shortcut: the dialog is reached by the
 * 🔗 button alone.
 */
export const TOOLBAR: readonly ToolbarEntry[] = [
  {
    label: 'B',
    title: 'Bold (Ctrl+B)',
    style: { fontWeight: '800' },
    active: { name: 'bold' },
    run: (chain) => chain.toggleBold(),
  },
  {
    label: 'I',
    title: 'Italic (Ctrl+I)',
    style: { fontStyle: 'italic' },
    active: { name: 'italic' },
    run: (chain) => chain.toggleItalic(),
  },
  {
    label: 'S',
    title: 'Strikethrough',
    style: { textDecoration: 'line-through' },
    active: { name: 'strike' },
    run: (chain) => chain.toggleStrike(),
  },
  { label: '</>', title: 'Inline code', active: { name: 'code' }, run: (c) => c.toggleCode() },
  'separator',
  {
    label: 'H1',
    title: 'Heading 1',
    active: { name: 'heading', attrs: { level: 1 } },
    run: (chain) => chain.toggleHeading({ level: 1 }),
  },
  {
    label: 'H2',
    title: 'Heading 2',
    active: { name: 'heading', attrs: { level: 2 } },
    run: (chain) => chain.toggleHeading({ level: 2 }),
  },
  {
    label: 'H3',
    title: 'Heading 3',
    active: { name: 'heading', attrs: { level: 3 } },
    run: (chain) => chain.toggleHeading({ level: 3 }),
  },
  'separator',
  { label: '☑', title: 'Checklist', active: { name: 'taskList' }, run: (c) => c.toggleTaskList() },
  { label: '•', title: 'Bullet list', active: { name: 'bulletList' }, run: (c) => c.toggleBulletList() },
  {
    label: '1.',
    title: 'Numbered list',
    active: { name: 'orderedList' },
    run: (chain) => chain.toggleOrderedList(),
  },
  { label: '❝', title: 'Quote', active: { name: 'blockquote' }, run: (c) => c.toggleBlockquote() },
  { label: '―', title: 'Divider', run: (chain) => chain.setHorizontalRule() },
  'separator',
  { label: '🔗', title: 'Link', active: { name: 'link' }, run: 'link' },
]
