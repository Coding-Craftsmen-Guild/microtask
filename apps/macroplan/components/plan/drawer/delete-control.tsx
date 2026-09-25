'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { DELETE_FEATURE, DELETE_ITEM, PROBLEM, type SubjectRemove } from './field'
import type { SubjectKind } from './values'

const GROUP = 'grid justify-items-start gap-1'

const CONFIRMS: Readonly<Record<SubjectKind, string>> = {
  feature: 'Delete feature',
  item: 'Delete item',
}

const MESSAGES: Readonly<Record<SubjectKind, string>> = {
  feature: DELETE_FEATURE,
  item: DELETE_ITEM,
}

/** Props for {@link DeleteControl}. */
export interface DeleteControlProps {
  /** The plan this subject belongs to, which the delete is addressed at. */
  readonly planId: string

  /** The feature id or the item id, whichever kind this is. */
  readonly subjectId: string

  /** Which of the two this is, which decides the confirm's label and the sentence under it. */
  readonly kind: SubjectKind

  /** The subject's stored name, quoted in the question so a reader is told which one is going. */
  readonly name: string

  /** Where to go once it is gone: the plan's own path, which is this address with nothing selected. */
  readonly closeHref: string

  /** Sends the delete and answers the plan it produced, or why it was refused. */
  readonly remove: SubjectRemove
}

/**
 * The one destructive control in the drawer: a feature or an item deleted, behind a confirm.
 *
 * ### It is `manage`-tier, which is why it is in the band it is in
 *
 * `feature:delete` and `item:delete` are granted to `manage` alone, where `feature:rename`,
 * `feature:estimate` and `item:describe` beside them are `write` (`MANAGE` and `WRITE` in
 * `packages/kernel/src/access/policy.ts`). So this is mounted by `./drawer-manage.tsx` and never by
 * `./drawer-edits.tsx`, and a seat holding `write` and not `manage` is shown the band this is not in.
 * {@link removalFor} picks the write by **kind** rather than letting a caller pass one
 * (`./subject-writes.ts`): the two ids are strings the compiler cannot tell apart.
 *
 * The control is a rendering answer and never a gate. The API is asked again at the instant of the
 * click, and a seat re-roled since the render meets its 403 as the sentence under this button
 * (ADR 0038, ADR 0009).
 *
 * ### Enter cannot delete, and that is the dialog's doing rather than this file's
 *
 * `danger` is set, and in that case `ConfirmDialog` moves focus to the dialog **body** instead of to
 * the confirm button — `onOpenAutoFocus={focusOnOpen(() => (danger ? content.current : confirm.current))}`
 * (`packages/ui/src/shell/confirm-dialog.tsx`, `focusOnOpen` in `shell/dismiss.ts`). Nothing focusable is
 * focused, so there is nothing for Enter to activate and a click is the only way through, while a
 * non-destructive confirm does focus its button and Enter accepts it. Focus lands **inside** the dialog
 * rather than staying on the trigger, because a trigger still focused would have Enter reopen what it
 * just opened.
 *
 * ### The message names what goes with it, and says the truth about undo
 *
 * {@link DELETE_FEATURE} and {@link DELETE_ITEM} are the two sentences, and `./field.ts` is where each
 * cascade is cited. Both end "This cannot be undone", because nothing in
 * `packages/macroplan-domain/src/services/` writes a deleted branch aside: `withoutFeatures` replaces the
 * manifest and `deleteItems` removes the files. The undo a later task builds is an undo of a **move** —
 * it reverses a placement by sending the placement back — and there is no write that puts a deleted
 * feature or item back, so a message hinting otherwise would be a promise this product cannot keep.
 *
 * ### A delete answers the whole plan, and the drawer it was sent from is gone
 *
 * On success this navigates to {@link DeleteControlProps.closeHref} and reads nothing back. Every other
 * control in this drawer re-reads its subject out of the plan the write answered; this one has no
 * subject left to read, and the page it is standing on would `notFound()` on its next render — the
 * drawer pages resolve through the row and call `notFound()` for an id the plan no longer holds
 * (`app/(admin)/plans/[planId]/f/[featureId]/page.tsx`). So `refresh()`, which `adminWrite` already asks
 * for on every successful write, is **not** enough on its own: it would re-render the route this control
 * is standing on into a 404 for a thing the user deliberately deleted.
 *
 * It is `replace` and not `push`: the address being replaced is the drawer's, which no longer resolves,
 * and pushing would leave it one Back away — Back being the first thing a user reaches for after a
 * delete they want to check on.
 *
 * The destination is a **prop** and never `planPath(planId)` worked out here, and that is the difference
 * between this control and one that would break the day `/s/<token>/f/<featureId>` exists: a seat holder
 * sent to `/plans/<planId>` meets a surface that reads a cookie they cannot have and a login with no
 * password behind it (ADR 0032). `./drawer-panel.tsx` already takes that path from the page that knows
 * which surface it is, for its own Close link, and this is the same address.
 *
 * A refusal is said beside the button and nothing is navigated, so a delete the API would not make
 * leaves the reader looking at the thing they still have.
 */
export function DeleteControl({
  planId,
  subjectId,
  kind,
  name,
  closeHref,
  remove,
}: DeleteControlProps) {
  const router = useRouter()
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState('')
  const confirmed = async () => {
    setAsking(false)
    const result = await orNoAnswer(remove)(planId, subjectId)
    if (result.ok) router.replace(closeHref)
    else setProblem(result.detail)
  }
  return (
    <div className={GROUP}>
      <Button
        onClick={() => setAsking(true)}
        size="sm"
        title={CONFIRMS[kind]}
        type="button"
        variant="destructive"
      >
        Delete
      </Button>
      {problem === '' ? null : (
        <p className={PROBLEM} role="alert">
          {problem}
        </p>
      )}
      <ConfirmDialog
        confirmLabel={CONFIRMS[kind]}
        danger
        message={MESSAGES[kind]}
        onCancel={() => setAsking(false)}
        onConfirm={() => void confirmed()}
        open={asking}
        title={`Delete “${name}”?`}
      />
    </div>
  )
}
