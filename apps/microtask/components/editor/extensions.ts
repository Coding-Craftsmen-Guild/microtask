import type { EditorOptions, Extensions, NodeViewRenderer } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { normalizeHref } from './safe-href'

/**
 * The prompt an empty editable tab shows.
 *
 * Legacy's read `Write notes, or press / … try the ☑ button for a checklist` and no
 * slash-command extension was ever installed, so the first thing it told a new user to try did
 * nothing. The `/` is dropped rather than carried forward; the ☑ half is real.
 */
export const PLACEHOLDER = 'Write notes, or try the ☑ button for a checklist'

const disableOwnCheckbox = (dom: Node): void => {
  if (dom instanceof HTMLElement) dom.querySelector('label > input[type="checkbox"]')?.setAttribute('disabled', '')
}

const ReadOnlyTaskItem = TaskItem.extend({
  addNodeView() {
    const render: NodeViewRenderer | null = this.parent?.() ?? null
    if (render === null) return null
    return (props) => {
      const view = render(props)
      disableOwnCheckbox(view.dom)
      return view
    }
  },
})

/**
 * Every extension the checklist editor runs, for one view.
 *
 * Each deviation from StarterKit's defaults is load-bearing and measured (ADR 0039):
 *
 * - `trailingNode: false`, because StarterKit 3 otherwise appends an empty paragraph on the
 *   **first** transaction against any document not ending in one. Both production checklist
 *   tabs end in a `taskList`, so left on it turns the first keystroke into a diff the user did
 *   not type, an autosave they did not cause, and an `updatedAt` bump every other viewer then
 *   has to reconcile — while changing no `taskItem` count, which is why it would go unnoticed.
 * - `link` **inside** `StarterKit.configure`, because StarterKit 3 bundles it. A separate
 *   `Link` extension logs `Duplicate extension names found: [link]` and races two
 *   configurations of one mark, so whether `openOnClick` is honoured turns on extension order.
 * - `openOnClick: !editable`, which is the asymmetry the app being replaced had: a link
 *   navigates from a read-only view and only places the caret in an editable one.
 * - `isAllowedUri` is the link dialog's own {@link normalizeHref}, so one allowlist decides
 *   every path a link can arrive by — the dialog, `setLink`, a paste, an autolink, and the
 *   render of a stored mark. Tiptap's default admits `ftp`, `sms`, `callto`, `cid` and `xmpp`,
 *   which the boundary guard rejects (ADR 0029), and a stored href it refuses renders with an
 *   empty `href` rather than being rewritten.
 * - `TaskList` and `TaskItem` from `@tiptap/extension-list`, `Placeholder` from
 *   `@tiptap/extensions`. The `extension-task-list`, `-task-item` and `-placeholder` packages
 *   still publish, and each is a two-line re-export shim.
 * - In a read-only view, Tiptap's own task item node view with its checkbox `disabled`. Tiptap
 *   draws a live `<input type="checkbox">` whatever the view, so a screen reader announced a box
 *   it could toggle and a keyboard could focus and flip it; `disabled` is what assistive
 *   technology reads, and it stops the click and the key at once. The node view is built before
 *   its nested items are, so the one checkbox it finds is its own.
 * - No `onReadOnlyChecked`. Omitting it still snaps back any change that reaches a read-only
 *   checkbox regardless, which is the intended read-only feel rather than an oversight.
 *
 * `heading` keeps legacy's three levels, so `#### ` does nothing, and `codeBlock` keeps its
 * `spellcheck="false"` attribute.
 */
export function buildExtensions(editable: boolean): Extensions {
  return [
    StarterKit.configure({
      trailingNode: false,
      heading: { levels: [1, 2, 3] },
      codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
      link: {
        openOnClick: !editable,
        autolink: true,
        linkOnPaste: true,
        isAllowedUri: (url) => normalizeHref(url) !== null,
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
      },
    }),
    TaskList,
    (editable ? TaskItem : ReadOnlyTaskItem).configure({ nested: true }),
    Placeholder.configure({ placeholder: editable ? PLACEHOLDER : '' }),
  ]
}

const PROSE =
  'outline-none min-h-[320px] [&_p]:my-2 [&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2'

const READONLY =
  'caret-transparent [&_input[type=checkbox]]:pointer-events-none [&_input[type=checkbox]]:opacity-70 [&_input[type=checkbox]]:cursor-default'

/**
 * The `editorProps` the contenteditable surface carries, for one view.
 *
 * `spellcheck` is stringified from `editable` exactly as legacy did, so a read-only document is
 * not underlined in red. The read-only class is what makes a checkbox look untouchable before
 * a click proves it is — the snap-back itself comes from configuring no `onReadOnlyChecked`.
 *
 * Both class strings are written out whole rather than composed from fragments, because
 * Tailwind's scanner reads source as plain text and emits nothing for a name it cannot see
 * literally (ADR 0025).
 */
export function editorProps(editable: boolean): EditorOptions['editorProps'] {
  return {
    attributes: {
      spellcheck: String(editable),
      class: editable ? PROSE : `${PROSE} ${READONLY}`,
    },
  }
}
