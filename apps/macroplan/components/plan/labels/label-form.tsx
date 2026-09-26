'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import { LabelFields } from './label-fields'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

/** One group renamed or recoloured: the plan, the group, and the one value being replaced. */
export type LabelWrite = (planId: string, labelId: string, value: string) => Promise<ActionResult<Plan>>

/** One group removed: the plan and the group, and nothing to send. */
export type LabelDelete = (planId: string, labelId: string) => Promise<ActionResult<Plan>>

/** Props for {@link LabelForm}: primitives and unbound actions, which is all a boundary admits. */
export interface LabelFormProps {
  /** The plan the group belongs to. */
  readonly planId: string

  /** The group being edited. */
  readonly labelId: string

  /** Its name as stored, which is what the field opens with. */
  readonly name: string

  /** Its colour as stored. */
  readonly colour: string

  /** Renames it. */
  readonly rename: LabelWrite

  /** Recolours it. */
  readonly recolour: LabelWrite

  /** Removes it. */
  readonly remove: LabelDelete

  /** Whether to offer removing it at all — `PlanContentControls.removeLabel`. */
  readonly mayRemove: boolean

  /** Whether the name is editable — `renameLabel`. Without it the name is shown as text. */
  readonly mayRename: boolean

  /** Whether the hue is editable — `recolourLabel`. */
  readonly mayRecolour: boolean
}

const ROW = 'flex flex-wrap items-center gap-2'

/** What this form says when a name is emptied, before any request is made. */
export const LABEL_HINTS = { empty: 'A group needs a name.', cleared: '' } as const

/**
 * One group's name, its colour, and the button that deletes it.
 *
 * Two writes and not one form posting both, which is `actions/epics.ts`'s decision restated: the API asks
 * `label:rename` once for either field, so splitting buys no authority — what it buys is that the 422 an
 * empty body earns is unreachable from here, and that no caller has to track which fields share a gate.
 * The cost is that changing both is two requests, and a refusal of the second leaves the first written.
 *
 * The two controls themselves are `./label-fields.tsx`, which also says why the name commits on blur and
 * the colour on change. What stays here is the behaviour: which write each one sends, what an emptied name
 * does before any request is made, and where a refusal is said.
 *
 * Deleting is the destructive-looking control that is not: removing a group **removes no feature**, it
 * clears the group off the features that were in it. The button says `Delete group` rather than `Delete` so
 * the person clicking it reads which of the two it is.
 */
export function LabelForm(props: LabelFormProps) {
  const { planId, labelId, name, colour, rename, recolour, remove, mayRemove } = props
  const { mayRename, mayRecolour } = props
  const [typed, setTyped] = useState(name)
  const [problem, setProblem] = useState('')

  const send = async (write: LabelWrite, value: string): Promise<void> => {
    const result = await orNoAnswer(write)(planId, labelId, value)
    setProblem(result.ok ? LABEL_HINTS.cleared : result.detail)
  }

  const commit = async (): Promise<void> => {
    if (typed.trim() === '') {
      setProblem(LABEL_HINTS.empty)
      setTyped(name)
      return
    }
    if (typed.trim() !== name) await send(rename, typed.trim())
  }

  return (
    <div className="grid gap-1">
      <div className={ROW}>
        <LabelFields
        mayRecolour={mayRecolour}
        mayRename={mayRename}
          colour={colour}
          onColour={(value) => void send(recolour, value)}
          onCommit={() => void commit()}
          onTyped={setTyped}
          stored={name}
          typed={typed}
        />
        {mayRemove ? (
          <Button
            onClick={() => void orNoAnswer(remove)(planId, labelId)}
            size="sm"
            type="button"
            variant="outline"
          >
            Delete group
          </Button>
        ) : null}
      </div>
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
