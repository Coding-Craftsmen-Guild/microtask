'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

/** Adds one group: the plan and the name it is called. The colour is the server's to pick. */
export type CreateLabelWrite = (
  planId: string,
  label: { readonly name: string },
) => Promise<ActionResult<Plan>>

/** Props for {@link NewLabelForm}. */
export interface NewLabelFormProps {
  /** The plan the group is added to. */
  readonly planId: string

  /** Sends it. */
  readonly create: CreateLabelWrite
}

const ROW = 'flex flex-wrap items-center gap-2'

const INPUT = 'h-8 w-[18ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

/** What this form says before any request is made, and what it suggests a group is called. */
export const NEW_LABEL_WORDS = {
  empty: 'A group needs a name.',
  cleared: '',
  placeholder: 'Phase 1',
} as const

/**
 * Adds one group to the plan, by name.
 *
 * It sends **no colour**, which is a decision rather than a missing field: `CreateLabelPayload` leaves it
 * optional and the service picks one, so the one place a default hue is chosen is the server — and a form
 * that opened with a colour would be that decision made twice. Recolouring is one click away on the row the
 * new group arrives as, which is also where it can be seen against the groups already there.
 *
 * The field clears on success and keeps what was typed on a refusal, because the two failures worth acting
 * on are both about the value: a plan at `LIMITS.labelsPerPlan` answers 422, and a name of nothing but
 * whitespace is refused here before a request is made.
 */
export function NewLabelForm({ planId, create }: NewLabelFormProps) {
  const [typed, setTyped] = useState('')
  const [problem, setProblem] = useState('')

  const send = async (): Promise<void> => {
    if (typed.trim() === '') {
      setProblem(NEW_LABEL_WORDS.empty)
      return
    }
    const result = await orNoAnswer(create)(planId, { name: typed.trim() })
    setProblem(result.ok ? NEW_LABEL_WORDS.cleared : result.detail)
    if (result.ok) setTyped('')
  }

  return (
    <div className="grid gap-1">
      <div className={ROW}>
        <input
          aria-label="Name of a new group"
          className={INPUT}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={NEW_LABEL_WORDS.placeholder}
          type="text"
          value={typed}
        />
        <Button onClick={() => void send()} size="sm" type="button">
          Add a group
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
