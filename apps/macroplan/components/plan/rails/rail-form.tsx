'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { RailFields } from './rail-fields'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

/** One rail renamed or recoloured: the plan, the rail, and the one value replacing what was there. */
export type RailWrite = (planId: string, epicId: string, value: string) => Promise<ActionResult<Plan>>

/** One rail moved among its siblings: the plan, the rail, and the 0-based lane it moves to. */
export type RailOrderWrite = (
  planId: string,
  epicId: string,
  railOrder: number,
) => Promise<ActionResult<Plan>>

/** One rail removed, with everything on it: the plan and the rail, and nothing to send. */
export type RailDelete = (planId: string, epicId: string) => Promise<ActionResult<Plan>>

/** Props for {@link RailForm}: primitives and unbound actions, which is all a boundary admits. */
export interface RailFormProps {
  /** The plan the rail belongs to. */
  readonly planId: string

  /** The rail being edited. */
  readonly epicId: string

  /** Its name as stored, which is what the field opens with. */
  readonly name: string

  /** Its colour as stored. */
  readonly colour: string

  /** Where it sits now, 0-based. */
  readonly railOrder: number

  /** How many features are on it, so a delete says what it would take with it. */
  readonly features: number

  /** Renames it. */
  readonly rename: RailWrite

  /** Recolours it. */
  readonly recolour: RailWrite

  /** Moves it among its siblings. */
  readonly reorder: RailOrderWrite

  /** Removes it, and everything on it. */
  readonly remove: RailDelete

  /** Whether the name is editable — `renameEpic`. Without it the name is shown as text. */
  readonly mayRename: boolean

  /** Whether the hue is editable — `recolourEpic`. */
  readonly mayRecolour: boolean

  /** Whether to offer moving it — `PlanContentControls.reorderEpic`, its own gate. */
  readonly mayReorder: boolean

  /** Whether to offer removing it — `PlanContentControls.removeEpic`. */
  readonly mayRemove: boolean
}

/** What this form says itself, before any request is made. */
export const RAIL_WORDS = { empty: 'A rail needs a name.', cleared: '' } as const

/**
 * One rail's four writes, and the one sentence any of them is refused with.
 *
 * Four writes and not one form posting all of them, which is `actions/epics.ts`'s decision restated: the
 * API asks `epic:rename` once for a name, a colour or both, so splitting buys no authority — what it buys
 * is that the 422 an empty body earns is unreachable from here, and that no caller has to track which
 * fields share a gate. The lane could not have ridden along in any case: `epic:reorder` is a **different**
 * action from `epic:rename`, which is why `reorderEpic` has a control of its own.
 *
 * The name commits on **blur** rather than per keystroke, so one rename is one request; the colour and the
 * lane commit on change, neither having a half-typed state worth waiting through. A lane that is not a
 * whole number at or above zero sends nothing at all — clearing a number input leaves `''`, and `Number('')`
 * is `0`, so an unguarded read would move the rail to the top the moment somebody selected the field and
 * deleted its contents on the way to typing a 3.
 *
 * Nothing here repaints from its own answer, and that is the whole reason these are Server Actions: each
 * one answers the plan and `adminWrite` re-renders the page, so the row this form sits in is rebuilt from
 * what the server stored. That matters rather than being tidy — `cleanName` collapses whitespace and the
 * domain renumbers every rail densely, so the name and the lane a reader typed and the ones the plan holds
 * can legitimately differ, and a form painting its own optimistic answer would show the wrong one.
 */
export function RailForm(props: RailFormProps) {
  const { planId, epicId, name, colour, railOrder, features } = props
  const { rename, recolour, reorder, remove, mayReorder, mayRemove } = props
  const { mayRename, mayRecolour } = props
  const [typed, setTyped] = useState(name)
  const [problem, setProblem] = useState('')

  const said = (result: ActionResult<Plan>): void => {
    setProblem(result.ok ? RAIL_WORDS.cleared : result.detail)
  }

  const commit = (): void => {
    if (typed.trim() === '') {
      setProblem(RAIL_WORDS.empty)
      setTyped(name)
      return
    }
    if (typed.trim() !== name) void orNoAnswer(rename)(planId, epicId, typed.trim()).then(said)
  }

  const move = (value: string): void => {
    const lane = Number(value)
    if (value === '' || !Number.isInteger(lane) || lane < 0) return
    void orNoAnswer(reorder)(planId, epicId, lane).then(said)
  }

  return (
    <div className="grid gap-1">
      <RailFields
        colour={colour}
        features={features}
        mayRecolour={mayRecolour}
        mayRemove={mayRemove}
        mayRename={mayRename}
        mayReorder={mayReorder}
        name={name}
        onColour={(value) => void orNoAnswer(recolour)(planId, epicId, value).then(said)}
        onCommit={commit}
        onName={setTyped}
        onOrder={move}
        onRemove={() => void orNoAnswer(remove)(planId, epicId).then(said)}
        railOrder={railOrder}
        typed={typed}
      />
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
