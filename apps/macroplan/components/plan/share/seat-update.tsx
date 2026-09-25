import { Button } from '@repo/ui/components/button'
import { PromptDialog } from '@repo/ui/shell/prompt-dialog'
import { useState } from 'react'
import { NOTHING_TO_SAVE, ROLES, ROLE_LABEL, seatName } from './seat-words'
import type { PlanSeat, PlanSeats } from './use-plan-seats'

const SELECT = 'h-8 rounded-lg border border-input bg-transparent px-2 text-sm'

const SAID = 'text-[12.5px] text-muted-foreground'

/** Props for {@link SeatUpdate}. */
export interface SeatUpdateProps {
  /** The seat being renamed or re-roled. */
  readonly seat: PlanSeat

  /** The manager's state, which the `PATCH` goes through. */
  readonly seats: PlanSeats
}

/**
 * The two edits `share:update` buys: a seat's name, and its role.
 *
 * Its own file beside {@link SeatRevoke} because the two are gated on two different answers — the row
 * mounts each on its own boolean — and because one file holding both was over this app's 80-line cap for
 * a `.tsx`. The split follows the capability rather than the layout.
 *
 * Both are one `PATCH` and **keep the token**, so a holder's bookmarked URL goes on working and a
 * downgrade reads as a narrowing rather than a lockout (ADR 0035). A rename may clear the name: the
 * payload admits `''`, `PlanShareLink.name` stores it, and the row words the result `Unnamed seat` — which
 * is why the prompt is `allowEmpty`.
 *
 * **An edit that would change nothing is refused here**, and that is not belt-and-braces:
 * `UpdateShareLinkPayload` is the one payload this product reaches carrying no non-empty refinement, so an
 * empty change is a well-formed **200 with the seat as it was** — indistinguishable, to the caller, from an
 * edit that saved. The role chooser cannot ask for one, a `select` firing only on a change; the rename
 * prompt can, and it then says {@link NOTHING_TO_SAVE} and sends nothing.
 *
 * That sentence is about what happened **in this browser**. A refusal from the API belongs to the
 * manager's own line, which `seat-list.tsx` draws once rather than once per row.
 */
export function SeatUpdate({ seat, seats }: SeatUpdateProps) {
  const [asking, ask] = useState(false)
  const [said, setSaid] = useState('')
  const rename = (name: string) => {
    ask(false)
    if (name === seat.name.trim()) setSaid(NOTHING_TO_SAVE)
    else void seats.edit(seat.token, { name })
  }
  const reRole = (chosen: string) => {
    const role = ROLES.find((one) => one === chosen)
    if (role !== undefined && role !== seat.role) void seats.edit(seat.token, { role })
  }
  return (
    <>
      <Button onClick={() => ask(true)} size="sm" type="button" variant="outline">
        Rename
      </Button>
      <select
        aria-label={`Access for ${seatName(seat.name)}`}
        className={SELECT}
        onChange={(event) => reRole(event.currentTarget.value)}
        value={seat.role}
      >
        {ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABEL[role]}
          </option>
        ))}
      </select>
      {said === '' ? null : (
        <p className={SAID} role="status">
          {said}
        </p>
      )}
      <PromptDialog
        allowEmpty
        defaultValue={seat.name}
        label="Who is it for?"
        onCancel={() => ask(false)}
        onSubmit={rename}
        open={asking}
        placeholder="Jane at ACME"
        submitLabel="Save"
        title="Name this seat"
      />
    </>
  )
}
