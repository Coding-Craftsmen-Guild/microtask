/**
 * Wires every way a modal can close without a decision — Escape, the Cancel
 * button, a click outside — onto one cancel callback.
 *
 * Both shell dialogs resolve their cancel branch this way, so Escape cannot
 * come to mean something different in one of them.
 *
 * @param onCancel - Called once the dialog reports itself closed.
 * @returns An `onOpenChange` handler for a `Dialog`.
 */
export const cancelWhenClosed = (onCancel: () => void) => (open: boolean) => {
  if (!open) onCancel()
}

/**
 * Takes over what a dialog focuses when it opens, replacing the default of
 * "the first focusable thing inside".
 *
 * The default is wrong in both directions here: a destructive confirm must
 * focus nothing actionable so Enter cannot delete, and a prompt must focus its
 * input rather than the Cancel button that precedes it in the DOM.
 *
 * @param pick - Returns the element to focus, or null to focus nothing.
 * @param select - Whether to text-select the element, so retyping replaces.
 * @returns An `onOpenAutoFocus` handler for a `DialogContent`.
 */
export const focusOnOpen =
  (pick: () => HTMLElement | null, select = false) =>
  (event: Event) => {
    event.preventDefault()
    const target = pick()
    target?.focus()
    if (select && target instanceof HTMLInputElement) target.select()
  }
