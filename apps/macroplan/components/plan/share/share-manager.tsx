'use client'

import { Button } from '@repo/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@repo/ui/components/popover'
import { useState } from 'react'
import { SeatList } from './seat-list'
import { SHARE_HINT, SHARE_WORDS } from './seat-words'
import { usePlanSeats, type PlanSeatActions } from './use-plan-seats'

const OPENER =
  'inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md bg-brand px-3 text-[13px] font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand'

const PANEL =
  'max-h-[70vh] w-[min(34rem,calc(100vw-2rem))] gap-3 overflow-y-auto rounded-[10px] border border-border p-4 shadow-[0_12px_32px_rgba(46,36,86,.16),0_2px_6px_rgba(0,0,0,.06)]'

const TITLE = 'text-[13px] font-semibold'

const HINT = 'text-[12px] text-hint'

const FOOTER = 'flex justify-end'

const TITLE_ID = 'plan-share-title'

const DONE = 'Done'

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
 * The Share button in the head row, and the panel whose seats **load when it opens**.
 *
 * The page renders no seat and no count. A token-bearing list handed to a client component is serialised
 * into the Flight payload and lands in the HTML, which is the credential dump ADR 0033 exists to prevent
 * — and its second amendment refuses to rely on the tree happening to be server-only, which is why the
 * plan both surfaces render is a `PlanScreenModel` whose `shareLinks?: never` makes carrying one a
 * compile error. So tokens reach this browser only in the answer to {@link ShareManagerProps.listSeats},
 * asked after this panel is open, and are dropped again when it closes (`use-plan-seats.ts`).
 *
 * ### Why this one is a popover where Settings is a `<details>`
 *
 * Because of that sentence. A `<details>` keeps its content mounted whether it is open or shut, so a
 * seat list inside one would mount — and fetch — on every page load, which is the whole leak restated
 * as a layout choice. A Radix popover mounts its content when it opens and unmounts it when it closes,
 * which is the behaviour this panel's contents actually require. `shell/menu-button.tsx` carries why
 * every other menu on this page is the cheaper disclosure.
 *
 * It was a **modal dialog**, opened by a button that was itself inside the share drawer's panel — so
 * reaching a seat list meant a route, then a drawer, then a button, then a dialog over all three. The
 * drawer and the dialog are both gone: this is the control, in the head row, one press from the plan.
 *
 * There is no count beside the button, where Microtask's manager shows a server-rendered one. It could
 * not have one honestly: `shareLinkCount` is a field of the plan **list** row, and the plan a page reads
 * carries `shareLinks` itself — the block this app drops on the server before anything renders. A count
 * would therefore be a second read of the plan to render a number, or the very block that may not be
 * rendered.
 *
 * It draws nothing at all for a surface that may neither list nor mint, which in this product is every
 * seat below `manage`: a Share button whose panel can only 403 is worse than no button.
 *
 * `load` on open and `forget` on close are both this component's, and they are one function so that the
 * popover's own dismissals — Escape, a click outside, the trigger again, `Done` — cannot each forget
 * differently. `Done` is kept from the dialog this replaced, and it is not redundant with the three
 * native ones: the panel holds a form, and a form wants an end.
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
    <Popover onOpenChange={change} open={open}>
      <PopoverTrigger className={OPENER} data-slot="plan-share-menu">
        {SHARE_WORDS.open}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby={TITLE_ID}
        className={PANEL}
        data-slot="plan-share-panel"
      >
        <p className={TITLE} id={TITLE_ID}>
          {SHARE_WORDS.heading}
        </p>
        <p className={HINT}>{SHARE_HINT}</p>
        <SeatList
          mayCreate={mayCreate}
          mayRead={mayRead}
          mayRevoke={mayRevoke}
          mayUpdate={mayUpdate}
          seats={seats}
        />
        <div className={FOOTER}>
          <Button onClick={() => change(false)} size="sm" type="button" variant="outline">
            {DONE}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
