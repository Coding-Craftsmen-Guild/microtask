'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { FIELD_CELL, FIELD_PROBLEM, MICRO } from './field-css'
import type { SubjectWrite } from './field'
import { SprintList } from './sprint-list'
import { SprintOpener } from './sprint-opener'
import { sprintChoices, sprintValue, stepPin, SPRINT_WORDS } from './sprint-view'
import { StepRow } from './step-row'

const FIELD_ID = 'plan-drawer-pin'

const LABEL = 'Sprint'

/** Props for {@link PinField}. */
export interface PinFieldProps {
  /** The plan the pin is written to. */
  readonly planId: string

  /** The feature being pinned. Items have no pin of their own (`values.ts`). */
  readonly featureId: string

  /** The 0-based pin as stored, or `null` for a feature the schedule places freely. */
  readonly pinSprint: number | null

  /** The 0-based sprint the schedule put it in, which is what a step down walks towards. */
  readonly scheduledSprint: number | null

  /** How many sprints the list offers. */
  readonly sprintTotal: number

  /** The write, unbound. */
  readonly pin: SubjectWrite<number | null>

  /** The plan's first working day. */
  readonly startDate: string

  /** How many working days a sprint holds. */
  readonly sprintLengthDays: number

  /** The zone the dates are read in. */
  readonly timezone: string
}

/**
 * The sprint, as a stepper over a list of dates.
 *
 * ### Why it is no longer a number anybody types
 *
 * It was an input taking a sprint number, and that asked a reader to know two things the screen never
 * told them: which sprint the schedule had already chosen, and which dates the number they were typing
 * stood for. Both are now on the control — the value says `S3` and whether that is a pin or the
 * schedule's own answer, and opening it lists every sprint with the days it covers.
 *
 * ### What the two buttons mean
 *
 * `+` pins one sprint later than what is on screen. `-` walks the pin back towards the scheduled
 * sprint and then **clears it**, because a pin below that sprint changes nothing at all: the forward
 * pass folds a pin into a `max()`, so the only honest end of that road is no pin (`./sprint-view.ts`).
 * Each button is disabled where its press would do nothing, so a reader is never pressing into
 * silence.
 *
 * The list is **in flow** under the field rather than floating over it: the panel body scrolls, so an
 * absolutely positioned 240px list opened from a field near the bottom edge would be cut off with no
 * way to reach the rest. Opening it pushes the fields under it down.
 */
export function PinField(props: PinFieldProps) {
  const { planId, featureId, pinSprint, scheduledSprint, sprintTotal, pin } = props
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState('')
  const standing = { pinSprint, scheduledSprint }
  const value = sprintValue(standing)
  const down = stepPin(-1, standing, sprintTotal)
  const up = stepPin(1, standing, sprintTotal)

  const send = async (sprint: number | null): Promise<void> => {
    setOpen(false)
    const result = await orNoAnswer(pin)(planId, featureId, sprint)
    setProblem(result.ok ? '' : result.detail)
  }

  return (
    <div className={FIELD_CELL} data-slot="sprint-field">
      <span className={MICRO} id={FIELD_ID}>
        {LABEL}
      </span>
      <StepRow
        less={SPRINT_WORDS.less}
        lessOff={down === undefined}
        mini={false}
        more={SPRINT_WORDS.more}
        moreOff={up === undefined}
        onStep={(delta) => {
          const next = delta < 0 ? down : up
          if (next !== undefined) void send(next)
        }}
      >
        <SprintOpener labelledBy={FIELD_ID} onToggle={() => setOpen(!open)} open={open} value={value} />
      </StepRow>
      {open ? (
        <SprintList
          onPick={(sprint) => void send(sprint)}
          rows={sprintChoices(standing, sprintTotal, props)}
        />
      ) : null}
      {problem === '' ? null : (
        <p className={FIELD_PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
