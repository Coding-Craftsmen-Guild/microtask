import type { DropTarget } from '@repo/canvas'

const NOTICE = 'pt-1 text-[13px] text-muted-foreground'

const UNDO = 'ml-2 text-brand underline'

/** What a bar moved by hand said, and what taking it back would send. */
export interface Said {
  /** The sentence: {@link MOVED}, or whatever the write was refused with. */
  readonly text: string

  /** The feature that was moved, so an undo is addressed at the same one. */
  readonly featureId: string

  /** The `(epicId, position)` it held before the drop, or `null` when there is nothing to undo. */
  readonly back: DropTarget | null
}

/** What a landed placement says. Short, because the timeline underneath it has already redrawn. */
export const MOVED = 'Moved.'

/** Props for {@link DragNotice}. */
export interface DragNoticeProps {
  /** What was said, or `null` before anything has been. */
  readonly said: Said | null

  /** Sends the compensating placement, for the feature that moved and the place it held. */
  readonly undo: (featureId: string, back: DropTarget) => void
}

/**
 * The one line under the canvas: what the last drop did, with an undo where there is one.
 *
 * Spec §6 promises undo for a drag — "dragging is high-velocity editing and the existing Server Action
 * round trip has no natural 'put it back'" — and this is where it is offered, which is where the user is
 * looking. The idiom is `apps/microtask/components/tabs/use-notice.ts`'s: one notice at a time, lasting
 * until the next, with a tone rather than a toast queue. It is a line under the drawing rather than the
 * `sonner` Toaster that ships in `@repo/ui` and is mounted nowhere, which would be a global overlay
 * introduced for one affordance.
 *
 * `role="status"` rather than `role="alert"`, for both sentences. A refusal here is not the refusal idiom
 * the drawer's fields use: a field's `PROBLEM` line is the description of a control a reader is focused on
 * and interrupting is right there, where this is the outcome of a gesture only a pointer can make. A
 * reader who cannot make the gesture cannot be interrupted by its result either, and `polite` is what a
 * pointer user wants of a line that changes on every drop.
 *
 * The undo is a `<button>` and not a link: it sends a write. It is absent rather than disabled when there
 * is nothing to take back — a refused drop wrote nothing, and an undo of the undo is the next drop's
 * business, one step being the whole promise (`./drag-root.tsx` argues why a stack is not).
 *
 * No `'use client'`: it holds no state and no effect, and reaches the browser because `./drag-root.tsx`
 * imports it (`../drawer/field-shell.tsx` makes the same argument about the same rule).
 */
export function DragNotice({ said, undo }: DragNoticeProps) {
  if (said === null) return null
  const back = said.back
  const featureId = said.featureId
  return (
    <p className={NOTICE} role="status">
      {said.text}
      {back === null ? null : (
        <button className={UNDO} onClick={() => undo(featureId, back)} type="button">
          Undo
        </button>
      )}
    </p>
  )
}
