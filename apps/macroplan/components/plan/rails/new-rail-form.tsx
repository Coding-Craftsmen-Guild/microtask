'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { LIMITS } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

/** Adds one rail: the plan and the name it is called. The colour is the server's to pick. */
export type CreateRailWrite = (
  planId: string,
  epic: { readonly name: string },
) => Promise<ActionResult<Plan>>

/** Props for {@link NewRailForm}. */
export interface NewRailFormProps {
  /** The plan the rail is added to. */
  readonly planId: string

  /** Sends it. */
  readonly create: CreateRailWrite
}

const ROW = 'flex flex-wrap items-center gap-2'

const INPUT = 'h-8 w-[18ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

/** What this form says before any request is made, and what it suggests a rail is called. */
export const NEW_RAIL_WORDS = {
  empty: 'A rail needs a name.',
  cleared: '',
  placeholder: 'Platform',
  action: 'Add rail',
  label: 'Name of the new rail',
} as const

/**
 * Adds one rail to the plan, by name — **the control the whole product was unreachable without**.
 *
 * A feature names the rail it sits on (`CreateFeaturePayload` requires an `epicId`) and every other
 * write in Macroplan is addressed at a feature or an item below one, so a plan with no rails admitted
 * nothing at all: the canvas drew an empty axis, the table had no rows, and the drawer — which is where
 * `CreateControls` lives — could not be opened, because opening it needs a feature that cannot exist.
 * The five rail actions had shipped and been wired on both surfaces since phase 3 with no call site, and
 * `lib/plan-capabilities.ts` recorded that as deliberate on the grounds that spec §9's phase-3 row does
 * not name a rail editor. It does not; what the row also does not say is that without one a plan is a
 * dead end, which is the part that went unnoticed until somebody made a plan and could put nothing in it.
 *
 * It sends **no colour** and no placement. `CreateEpicPayload` leaves the hue optional and the service
 * picks one, so the single place a default is chosen is the server; and the rail lands at the bottom
 * because work is added in the order it is discovered (spec §6), which is why the payload carries no
 * position at all. Both are one control away on the row the new rail arrives as.
 *
 * The field clears on success and keeps what was typed on a refusal, because both failures worth acting
 * on are about the value: a plan at `LIMITS.epicsPerPlan` answers 422, and a name of nothing but
 * whitespace is refused here before a request is made.
 */
export function NewRailForm({ planId, create }: NewRailFormProps) {
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState('')

  const send = async (): Promise<void> => {
    if (typed.trim() === '') {
      setProblem(NEW_RAIL_WORDS.empty)
      return
    }
    const result = await orNoAnswer(create)(planId, { name: typed.trim() })
    setProblem(result.ok ? NEW_RAIL_WORDS.cleared : result.detail)
    if (result.ok) setTyped('')
  }

  return (
    <div className="grid gap-1">
      <div className={ROW}>
        <input
          aria-label={NEW_RAIL_WORDS.label}
          className={INPUT}
          maxLength={LIMITS.nameLength}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={NEW_RAIL_WORDS.placeholder}
          type="text"
          value={typed}
        />
        <Button onClick={() => void send()} size="sm" type="button">
          {NEW_RAIL_WORDS.action}
        </Button>
      </div>
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
