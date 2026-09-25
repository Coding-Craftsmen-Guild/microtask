import type { Decoded, NewPlanSeat, PlanSeatChange } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import type { PlanShareLink } from '@repo/contracts'
import { useRef, useState } from 'react'
import type { ActionResult } from '../../../actions/result'
import { SEAT_CREATED, SEAT_REVOKED, SEAT_UPDATED } from './seat-words'

/**
 * One seat on a plan as the manager holds it once opened — token included, and only then.
 *
 * There is no `scope`: a plan is shared at plan scope and nothing narrower exists, so a seat's scope is
 * implied by the plan whose manifest it lives in (ADR 0053, `packages/contracts/src/share-link.ts`).
 * That is the field a Microtask `ShareLink` carries and the reason this manager offers no scope choice.
 */
export type PlanSeat = Decoded<typeof PlanShareLink>

/**
 * The one read and the three writes, each a Server Action the page hands in.
 *
 * Handed in rather than imported, for the reason `apps/microtask/components/share-manager/types.ts`
 * gives: the same manager would render for a `manage` **seat** administering its plan's other seats
 * (ADR 0038), whose calls carry that seat's token rather than an admin cookie, so nothing under here
 * decides whose credential a request goes out under. Today one surface fills the slot — the admin's
 * plan layout — and `plan-screen.tsx`'s `share` prop is where the other's absence is stated.
 *
 * `list` is the plan read, because there is no seats endpoint: `POST`, `PATCH` and `DELETE` are the only
 * routes under `…/share-links`, and a plan's seats arrive inside `PlanView.shareLinks`
 * (`actions/plan-share-links.ts`).
 */
export interface PlanSeatActions {
  /** Answers every seat on the plan, token and all. Called when the manager opens, never to render. */
  readonly list: (planId: string) => Promise<ActionResult<readonly PlanSeat[]>>

  /** Mints a seat and answers it with its token. */
  readonly create: (planId: string, seat: NewPlanSeat) => Promise<ActionResult<PlanSeat>>

  /** Renames a seat or changes its role, keeping its token. */
  readonly update: (
    planId: string,
    token: string,
    change: PlanSeatChange,
  ) => Promise<ActionResult<PlanSeat>>

  /** Revokes a seat and every seat minted through it, and is answered nothing (ADR 0010). */
  readonly revoke: (planId: string, token: string) => Promise<ActionResult<void>>
}

/** Where the list is: not asked for, on its way, shown, or refused. */
export type SeatsState = 'idle' | 'loading' | 'ready' | 'failed'

/** The manager's seats and everything that changes them. */
export interface PlanSeats {
  /** The seats, once loaded, plus any minted since — each carrying its live token. */
  readonly seats: readonly PlanSeat[]

  /** Where the list is. */
  readonly state: SeatsState

  /** The last refusal, or `''`. */
  readonly problem: string

  /** The last success worth saying, or `''`. */
  readonly notice: string

  /** Asks for the seats — the moment a token may first reach this browser. */
  readonly load: () => Promise<void>

  /** Drops every seat held, so no token outlives the dialog that showed it. */
  readonly forget: () => void

  /** Mints a seat, answering whether it was minted. */
  readonly mint: (seat: NewPlanSeat) => Promise<boolean>

  /** Renames a seat or changes its role. */
  readonly edit: (token: string, change: PlanSeatChange) => Promise<void>

  /** Revokes a seat, and drops every seat held that was minted through it. */
  readonly revoke: (token: string) => Promise<void>
}

/**
 * Every seat but `token` and the seats descended from it, walked over the list held.
 *
 * The revoke route answers **204** and the handler discards the lineage the service computed, so the
 * set is not in the answer and no second read recovers it — the descendants are gone from the plan by
 * the time anything could ask (`packages/api-client/src/operations/plan-share-links.ts`). What is left
 * is the `createdBy` chain on the seats this manager already loaded, which is enough to stop drawing
 * rows whose tokens the API has just stopped resolving.
 *
 * It is deliberately **not** a claim about the plan, and that is why nothing counts what it dropped: a
 * list minutes old may not hold a seat minted through this one since, so a number said afterwards would
 * be about the list rather than the cascade. The warning is stated before the write instead
 * (`revokeMessage`), which is the only place it can be honest.
 *
 * The loop runs to a fixpoint rather than one level deep, so a grandchild goes with its grandparent, and
 * it terminates on a cycle the API cannot mint but a list of rows cannot rule out.
 *
 * @param held - The seats the manager is holding, in the order it drew them.
 * @param token - The seat revoked.
 * @returns The rows that survive, in the order they were in.
 */
export const withoutLineage = (
  held: readonly PlanSeat[],
  token: string,
): readonly PlanSeat[] => {
  const gone = new Set([token])
  let counted = 0
  while (gone.size !== counted) {
    counted = gone.size
    for (const seat of held) {
      if (seat.createdBy !== null && gone.has(seat.createdBy)) gone.add(seat.token)
    }
  }
  return held.filter((seat) => !gone.has(seat.token))
}

interface Held {
  readonly seats: readonly PlanSeat[]
  readonly state: SeatsState
  readonly problem: string
  readonly notice: string
}

const EMPTY: Held = { seats: [], state: 'idle', problem: '', notice: '' }

/**
 * The share manager's state: seats held only while the dialog is open.
 *
 * {@link PlanSeats.load} is called on open and {@link PlanSeats.forget} on close, so a token is in this
 * browser only between the two (ADR 0033). It is the whole of what keeps tokens out of the page: the
 * plan both surfaces render is a `PlanScreenModel`, whose `shareLinks?: never` makes carrying one a
 * compile error, so the seats have to be asked for and this is what asks.
 *
 * ### The generation ref, and what it protects
 *
 * Every answer is checked against the generation it was asked in, and an answer from an older one is
 * **dropped rather than applied**. `forget` bumps the generation, so a list still in flight when the
 * dialog closes cannot put its tokens back into a component that is no longer showing them — which is
 * exactly the leak "forget on close" exists to prevent, closing mid-request being the ordinary way a
 * slow list ends. `load` bumps it too, so reopening while the first answer is outstanding keeps the
 * newer answer and not whichever resolved last. A ref and not state, because the check happens inside a
 * closure that has already captured its render's values: a state variable would be read as the value it
 * had when the request left.
 *
 * Every call goes through `orNoAnswer`, so a list the server never answers ends in `failed` with a
 * sentence rather than in `loading` for ever, and a write that gets no answer is a refusal
 * (`packages/app-session/src/no-answer.ts`). It is per call rather than `eachOrNoAnswer` over the
 * object, as the drawer's fields do it, because nothing here depends on the actions object's identity.
 *
 * A **mint** appends to the list, where a revoke prunes it and an edit replaces one row: each keeps what
 * the answer said rather than re-listing, so one dialog makes one request per gesture. A refused write
 * changes no row at all, the plan being unchanged.
 *
 * @param planId - The plan whose seats these are, which every call is addressed at.
 * @param actions - The read and the three writes, carrying the surface's own credential.
 * @returns The seats held, and the five things a manager does: load, forget, mint, edit, revoke.
 */
export function usePlanSeats(planId: string, actions: PlanSeatActions): PlanSeats {
  const [held, setHeld] = useState<Held>(EMPTY)
  const generation = useRef(0)
  const answered = async <Value>(
    request: Promise<ActionResult<Value>>,
    said: string,
  ): Promise<{ readonly value: Value } | null> => {
    const asked = generation.current
    const result = await request
    if (asked !== generation.current) return null
    setHeld((was) => ({ ...was, problem: result.ok ? '' : result.detail, notice: result.ok ? said : '' }))
    return result.ok ? result : null
  }
  const load = async (): Promise<void> => {
    generation.current += 1
    const asked = generation.current
    setHeld((was) => ({ ...was, state: 'loading' }))
    const result = await orNoAnswer(actions.list)(planId)
    if (asked !== generation.current) return
    const seats = result.ok ? result.value : []
    setHeld({ seats, state: result.ok ? 'ready' : 'failed', problem: result.ok ? '' : result.detail, notice: '' })
  }
  const mint = async (seat: NewPlanSeat): Promise<boolean> => {
    const made = await answered(orNoAnswer(actions.create)(planId, seat), SEAT_CREATED)
    if (made !== null) setHeld((was) => ({ ...was, seats: [...was.seats, made.value] }))
    return made !== null
  }
  const edit = async (token: string, change: PlanSeatChange): Promise<void> => {
    const saved = await answered(orNoAnswer(actions.update)(planId, token, change), SEAT_UPDATED)
    if (saved === null) return
    setHeld((was) => ({
      ...was,
      seats: was.seats.map((one) => (one.token === token ? saved.value : one)),
    }))
  }
  const revoke = async (token: string): Promise<void> => {
    const gone = await answered(orNoAnswer(actions.revoke)(planId, token), SEAT_REVOKED)
    if (gone !== null) setHeld((was) => ({ ...was, seats: withoutLineage(was.seats, token) }))
  }
  const forget = (): void => {
    generation.current += 1
    setHeld(EMPTY)
  }
  return { ...held, load, forget, mint, edit, revoke }
}
