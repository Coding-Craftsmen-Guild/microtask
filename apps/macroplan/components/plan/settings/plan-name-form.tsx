'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import type { ActionResult } from '../../../actions/result'

/**
 * Renames one plan and answers the name the server **stored**.
 *
 * Not the name that was sent: `cleanName` collapses every run of whitespace and caps the length, so a
 * field that kept showing what was typed would show a name the plan does not have.
 */
export type RenameWrite = (planId: string, name: string) => Promise<ActionResult<string>>

/** Props for {@link PlanNameForm}. */
export interface PlanNameFormProps {
  /** The plan being renamed. */
  readonly planId: string

  /** Its stored name, which the field opens with and reverts to. */
  readonly name: string

  /** Sends the rename. */
  readonly rename: RenameWrite
}

const INPUT = 'h-8 w-[26ch] rounded-md border border-input bg-transparent px-2 text-[13px]'

/** What this form says when a name is emptied, before any request is made. */
export const PLAN_NAME_HINTS = { empty: 'A plan needs a name.', cleared: '' } as const

/**
 * The plan's name, edited in place, committing on blur.
 *
 * On blur and not per keystroke, so one rename is one request rather than one per letter — the same choice
 * the rail and group forms make, and for the same reason. An empty value is refused **here** rather than
 * sent: `EntityName` has a minimum, so the API would answer 422, and the sentence a person needs is "a
 * plan needs a name" rather than a validation error about a field they can see is blank. The field reverts
 * to the stored name in that case, so nothing is left in a state that cannot be saved.
 *
 * It repaints from the **answer** and not from what was typed, which is what the action answering a string
 * is for: a name typed with two spaces comes back with one, and the field shows the plan's real name
 * without a round trip through the page's own props.
 *
 * It is separate from the timing form beside it because the API gates the fields separately: a body
 * carrying a name and a date meets `plan:rename` **and** `plan:retime`, and the first refusal writes
 * neither. Two forms is what keeps each request one authority.
 */
export function PlanNameForm({ planId, name, rename }: PlanNameFormProps) {
  const [typed, setTyped] = useState(name)
  const [problem, setProblem] = useState('')

  const commit = async (): Promise<void> => {
    const wanted = typed.trim()
    if (wanted === '') {
      setProblem(PLAN_NAME_HINTS.empty)
      setTyped(name)
      return
    }
    if (wanted === name) return
    const result = await orNoAnswer(rename)(planId, wanted)
    setProblem(result.ok ? PLAN_NAME_HINTS.cleared : result.detail)
    setTyped(result.ok ? result.value : name)
  }

  return (
    <div className="grid gap-1">
      <input
        aria-label="Plan name"
        className={INPUT}
        onBlur={() => void commit()}
        onChange={(event) => setTyped(event.target.value)}
        type="text"
        value={typed}
      />
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
