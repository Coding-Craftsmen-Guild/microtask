'use client'

import { Button } from '@repo/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/dialog'
import { useState } from 'react'
import { SeatList } from './seat-list'
import { SHARE_HINT } from './seat-words'
import { usePlanSeats, type PlanSeatActions } from './use-plan-seats'

const GROUP = 'flex items-center gap-2.5'

const PANEL = 'sm:max-w-[620px]'

/**
 * Props for {@link ShareManager}: **no seat and no token among them**, and nine flat members.
 *
 * Flat because this is the boundary: every prop of a `'use client'` component is serialised into the
 * Flight payload and lands in the HTML, and `components/plan/module-boundaries.test.tsx` admits only
 * primitives, unbound functions and markup on `children` across one. So the four controls arrive as four
 * booleans rather than as a {@link PlanSeatControls}, and the four actions as four functions rather than
 * as one object — an object of either kind is refused there by shape, which is the check that would have
 * caught a seat list or a `PlanShareLink` riding in beside them.
 *
 * The actions are **props** rather than imports for the reason `PlanSeatActions` records: the same
 * manager would serve a `manage` seat administering its plan's other seats, whose calls carry that
 * seat's token, so nothing under here decides whose credential a request goes out under.
 */
export interface ShareManagerProps {
  /** The plan whose seats these are, which every call is addressed at. */
  readonly planId: string

  /** Whether this surface is told the plan's seats at all, which is what opening asks for. */
  readonly mayRead: boolean

  /** Whether it may mint one. Decided against the scope being minted, not the plan in the path. */
  readonly mayCreate: boolean

  /** Whether it may rename or re-role one. */
  readonly mayUpdate: boolean

  /** Whether it may revoke one. */
  readonly mayRevoke: boolean

  /** Answers every seat on the plan, token and all — called on open, never to render a page. */
  readonly listSeats: PlanSeatActions['list']

  /** Mints a seat and answers it with its token. */
  readonly mintSeat: PlanSeatActions['create']

  /** Renames a seat or changes its role, keeping its token. */
  readonly editSeat: PlanSeatActions['update']

  /** Revokes a seat and every seat minted through it. */
  readonly revokeSeat: PlanSeatActions['revoke']
}

/**
 * The Share button, and the dialog whose seats **load when it opens**.
 *
 * The page renders no seat and no count. A token-bearing list handed to a client component is serialised
 * into the Flight payload and lands in the HTML, which is the credential dump ADR 0033 exists to prevent
 * — and its second amendment refuses to rely on the tree happening to be server-only, which is why the
 * plan both surfaces render is a `PlanScreenModel` whose `shareLinks?: never` makes carrying one a
 * compile error. So tokens reach this browser only in the answer to {@link ShareManagerProps.listSeats},
 * asked after this dialog is open, and are dropped again when it closes (`use-plan-seats.ts`).
 *
 * There is no count beside the button, where Microtask's manager shows a server-rendered one. It could
 * not have one honestly: `shareLinkCount` is a field of the plan **list** row, and the plan a page reads
 * carries `shareLinks` itself — the block this app drops on the server before anything renders. A count
 * would therefore be a second read of the plan to render a number, or the very block that may not be
 * rendered.
 *
 * It draws nothing at all for a surface that may neither list nor mint, which in this product is every
 * seat below `manage`: a Share button whose dialog can only 403 is worse than no button.
 *
 * `load` on open and `forget` on close are both this component's, and they are one function so that the
 * dialog's own dismissals — Done, Escape, a click outside — cannot each forget differently.
 */
export function ShareManager(props: ShareManagerProps) {
  const { mayCreate, mayRead, mayRevoke, mayUpdate } = props
  const [open, setOpen] = useState(false)
  const seats = usePlanSeats(props.planId, {
    list: props.listSeats,
    create: props.mintSeat,
    update: props.editSeat,
    revoke: props.revokeSeat,
  })
  const change = (next: boolean) => {
    setOpen(next)
    if (!next) seats.forget()
    else if (mayRead) void seats.load()
  }
  if (!mayRead && !mayCreate) return null
  return (
    <div className={GROUP}>
      <Button onClick={() => change(true)} type="button">
        Share
      </Button>
      <Dialog onOpenChange={change} open={open}>
        <DialogContent className={PANEL} showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Share this plan</DialogTitle>
            <DialogDescription>{SHARE_HINT}</DialogDescription>
          </DialogHeader>
          <SeatList
            mayCreate={mayCreate}
            mayRead={mayRead}
            mayRevoke={mayRevoke}
            mayUpdate={mayUpdate}
            seats={seats}
          />
          <DialogFooter>
            <Button onClick={() => change(false)} type="button" variant="outline">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
