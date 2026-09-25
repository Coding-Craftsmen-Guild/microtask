import { Button } from '@repo/ui/components/button'
import { ConfirmDialog } from '@repo/ui/shell/confirm-dialog'
import { useState } from 'react'
import { revokeMessage, revokeTitle } from './seat-words'
import type { PlanSeat, PlanSeats } from './use-plan-seats'

/** Props for {@link SeatRevoke}. */
export interface SeatRevokeProps {
  /** The seat being revoked, whose role decides what the question has to warn about. */
  readonly seat: PlanSeat

  /** The manager's state, which the `DELETE` goes through. */
  readonly seats: PlanSeats
}

/**
 * Revoke, behind the one confirm that can ever state the cascade.
 *
 * **The warning has to come before the write**, and that is this file's whole shape: revoking a seat
 * revokes every seat minted through it (ADR 0010), the route answers **204**, and the handler discards
 * the lineage the service computed — Macroplan deliberately has no `RevokedShareLinks` contract where
 * Microtask has one. So nothing afterwards can say "and these three descendants went with it", and no
 * second read recovers the set: the descendants are gone from the plan by the time anything could ask.
 * `apps/microtask`'s manager counts the cascade in its success notice; this one cannot, and
 * `revokeMessage` is where that is paid for instead.
 *
 * The message is chosen by the seat's **role**, because a `manage` seat is the only kind that can mint
 * another — so it is the only one whose revoke can take other seats with it, and the only one told so.
 * What the list then drops is the lineage it was already holding (`withoutLineage`), which is a fact
 * about the rows on screen rather than a count of the plan's own.
 *
 * `danger` is set, so `ConfirmDialog` moves focus to the dialog **body** rather than to its confirm
 * button: nothing focusable is focused, Enter activates nothing, and a click is the only way through
 * (`packages/ui/src/shell/confirm-dialog.tsx`). The control is a rendering answer and never a gate — the
 * API is asked again at the instant of the click (ADR 0009, ADR 0038).
 */
export function SeatRevoke({ seat, seats }: SeatRevokeProps) {
  const [asking, ask] = useState(false)
  return (
    <>
      <Button onClick={() => ask(true)} size="sm" type="button" variant="destructive">
        Revoke
      </Button>
      <ConfirmDialog
        confirmLabel="Revoke seat"
        danger
        message={revokeMessage(seat.role)}
        onCancel={() => ask(false)}
        onConfirm={() => {
          ask(false)
          void seats.revoke(seat.token)
        }}
        open={asking}
        title={revokeTitle(seat.name)}
      />
    </>
  )
}
