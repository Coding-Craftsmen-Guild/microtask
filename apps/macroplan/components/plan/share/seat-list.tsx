import { Button } from '@repo/ui/components/button'
import { MintSeat } from './mint-seat'
import { SeatRow } from './seat-row'
import { LOADING_SEATS, NO_SEATS } from './seat-words'
import type { PlanSeats } from './use-plan-seats'

const BODY = 'grid max-h-[60vh] gap-4 overflow-y-auto'

const ROWS = 'grid'

const RETRY = 'flex flex-wrap items-center gap-3'

const NOTE = 'text-[13px] text-muted-foreground'

const PROBLEM = 'text-[13px] text-destructive'

const DONE = 'text-[13px] text-ok'

/** Props for {@link SeatList}. */
export interface SeatListProps {
  /** The seats and everything that changes them. */
  readonly seats: PlanSeats

  /** Whether this surface is told the plan's seats, which is what opening the manager asks. */
  readonly mayRead: boolean

  /** Whether it draws the mint form. */
  readonly mayCreate: boolean

  /** Whether each row draws Rename and the role chooser. */
  readonly mayUpdate: boolean

  /** Whether each row draws Revoke. */
  readonly mayRevoke: boolean
}

const Listed = ({ seats, mayRead, mayUpdate, mayRevoke }: Omit<SeatListProps, 'mayCreate'>) => {
  if (seats.state === 'loading') return <p className={NOTE}>{LOADING_SEATS}</p>
  if (seats.state === 'failed') {
    return (
      <div className={RETRY}>
        <p className={PROBLEM} role="alert">
          {seats.problem}
        </p>
        <Button onClick={() => void seats.load()} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </div>
    )
  }
  if (seats.seats.length === 0) return mayRead ? <p className={NOTE}>{NO_SEATS}</p> : null
  return (
    <div className={ROWS}>
      {seats.seats.map((seat) => (
        <SeatRow
          key={seat.token}
          mayRevoke={mayRevoke}
          mayUpdate={mayUpdate}
          seat={seat}
          seats={seats}
        />
      ))}
    </div>
  )
}

/**
 * The dialog's body: the mint form, what just happened, and the seats — or why there are none on screen.
 *
 * Each of the four controls is drawn from its own boolean, although in this product they are always
 * four copies of one answer: every `share:*` action is `manage`-minimum and a plan has exactly one
 * scope, so a plan seat holds all four or none (`lib/plan-capabilities.test.ts`). They stay four because
 * they are four questions the API answers separately — `share:create` against the scope being minted and
 * the others against the plan — and Microtask's task-scoped holder, which may mint what it may not list,
 * is what that shape exists for. So there is no counterpart to that manager's create-only note here: the
 * state it explains cannot be reached with a plan.
 *
 * A **refusal** is shown once, by the list rather than by a row, and a failed *list* shows it beside Try
 * again instead: an empty list with a sentence and no way to ask again is a dialog a reader has to close
 * and reopen. The notice above it is the last write that succeeded.
 *
 * A seat minted by a surface that may not list still appears, `Listed` drawing rows whenever it holds
 * any: the mint's answer is the only time a token comes back, so dropping the row would throw away the
 * one thing the gesture produced.
 */
export function SeatList({ seats, mayRead, mayCreate, mayUpdate, mayRevoke }: SeatListProps) {
  return (
    <div className={BODY}>
      {mayCreate ? <MintSeat onMint={seats.mint} /> : null}
      {seats.notice === '' ? null : (
        <p className={DONE} role="status">
          {seats.notice}
        </p>
      )}
      {seats.problem === '' || seats.state === 'failed' ? null : (
        <p className={PROBLEM} role="alert">
          {seats.problem}
        </p>
      )}
      <Listed mayRead={mayRead} mayRevoke={mayRevoke} mayUpdate={mayUpdate} seats={seats} />
    </div>
  )
}
