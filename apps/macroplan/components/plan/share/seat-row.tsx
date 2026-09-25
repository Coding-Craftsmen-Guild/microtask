import type { RoleValue } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { Input } from '@repo/ui/components/input'
import { useRef, useState } from 'react'
import { copySeatUrl } from './copy'
import { SeatRevoke } from './seat-revoke'
import { SeatUpdate } from './seat-update'
import { COPIED, COPY_FAILED, ROLE_LABEL, seatName, seatUrl } from './seat-words'
import type { PlanSeat, PlanSeats } from './use-plan-seats'

const ROW = 'grid gap-2 border-t border-foreground/10 py-3'

const HEAD = 'flex flex-wrap items-center gap-2'

const NAME = 'font-semibold'

const LINE = 'flex flex-wrap items-center gap-2'

const SAID = 'text-[12.5px] text-muted-foreground'

const BADGE: Readonly<Record<RoleValue, string>> = {
  view: 'rounded-full bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand',
  write: 'rounded-full bg-gold/25 px-2 py-0.5 text-[12px] font-medium text-foreground',
  manage: 'rounded-full bg-brand px-2 py-0.5 text-[12px] font-medium text-white',
}

const originNow = (): string => (typeof window === 'undefined' ? '' : window.location.origin)

/** Props for {@link SeatRow}. */
export interface SeatRowProps {
  /** The seat, token included — this row exists only inside the opened dialog. */
  readonly seat: PlanSeat

  /** The manager's state, for the writes {@link SeatUpdate} and {@link SeatRevoke} make. */
  readonly seats: PlanSeats

  /** Whether to draw Rename and the role chooser. */
  readonly mayUpdate: boolean

  /** Whether to draw Revoke. */
  readonly mayRevoke: boolean
}

/**
 * One seat: who it is for, what it may do, and **its URL** — with the edits beside it.
 *
 * The field holds `<origin>/s/<token>` and never the bare token, and Copy puts that same URL on the
 * clipboard: a token on screen without its address is a credential whose first paste is somewhere it does
 * not belong (`seat-words.ts`, ADR 0037). The origin is read from the browser at the moment the row is
 * drawn rather than written into the code, so one build serves whatever host it is deployed behind
 * (ADR 0022) — and `originNow` answers `''` where there is no browser, this being a component that only
 * ever renders inside an opened dialog.
 *
 * The copy sentence says **whether it actually copied**, which is the one thing the app being replaced got
 * wrong: it said "Link copied" unconditionally, including after both paths had failed (`copy.ts`). The
 * field is selected either way, so Ctrl+C remains offered.
 *
 * Renaming, re-roling and revoking are {@link SeatUpdate}'s and {@link SeatRevoke}'s — a split for the
 * reason `apps/microtask/components/share-manager/link-menu.tsx` is its own file, taken one step further:
 * the identity of a seat and its URL are what a row *is*, where the edits are two dialogs and three
 * writes, and a single file holding all of it was over this app's 80-line cap for a `.tsx`. The two are
 * separate files rather than one because they are gated on **two** answers — `share:update` and
 * `share:revoke` — so each is mounted on its own boolean here and neither can be drawn by the other's.
 */
export function SeatRow({ seat, seats, mayUpdate, mayRevoke }: SeatRowProps) {
  const field = useRef<HTMLInputElement>(null)
  const [said, setSaid] = useState('')
  const named = seatName(seat.name)
  const url = seatUrl(originNow(), seat.token)
  const copy = async () => {
    if (field.current === null) return
    setSaid((await copySeatUrl(field.current, url)) ? COPIED : COPY_FAILED)
  }
  return (
    <div className={ROW} data-testid="seat-row">
      <div className={HEAD}>
        <span className={NAME}>{named}</span>
        <span className={BADGE[seat.role]}>{ROLE_LABEL[seat.role]}</span>
      </div>
      <div className={LINE}>
        <Input aria-label={`Share URL for ${named}`} readOnly ref={field} value={url} />
        <Button onClick={() => void copy()} size="sm" type="button" variant="outline">
          Copy
        </Button>
        {mayUpdate ? <SeatUpdate seat={seat} seats={seats} /> : null}
        {mayRevoke ? <SeatRevoke seat={seat} seats={seats} /> : null}
      </div>
      {said === '' ? null : (
        <p className={SAID} role="status">
          {said}
        </p>
      )}
    </div>
  )
}
