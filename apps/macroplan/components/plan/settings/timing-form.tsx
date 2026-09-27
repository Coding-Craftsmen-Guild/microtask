'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { Button } from '@repo/ui/components/button'
import { useState } from 'react'
import { TIMING_WORDS, TimingFields } from './timing-fields'
import type { ActionResult } from '../../../actions/result'
import type { Plan } from '@repo/api-client'

/** One plan retimed: the plan, and whichever of the three calendar fields changed. */
export type RetimeWrite = (
  planId: string,
  timing: { readonly startDate?: string; readonly sprintLengthDays?: number; readonly timezone?: string },
) => Promise<ActionResult<Plan>>

/** Props for {@link TimingForm}: primitives and one unbound action, which is all a boundary admits. */
export interface TimingFormProps {
  /** The plan being retimed. */
  readonly planId: string

  /** Its stored start date. */
  readonly startDate: string

  /** Its stored sprint length. */
  readonly sprintLengthDays: number

  /** Its stored timezone. */
  readonly timezone: string

  /** Sends the change. */
  readonly retime: RetimeWrite
}

const ROW = 'flex flex-wrap items-end gap-2'

/** What this form says before any request is made, and after one that landed. */
export const TIMING_HINTS = { unchanged: 'Nothing changed.', cleared: '' } as const

/**
 * A plan's calendar: the first working day, the sprint length, and the zone today is read in.
 *
 * ### Why one request and not three
 *
 * This is the one form in the app that sends more than one field, and it is allowed to because all three
 * meet **one** gate: the API asks `plan:retime` for a `startDate`, a `sprintLengthDays` or a `timezone`
 * alike. `lib/plan-capabilities.ts` spells out the rule a combined body has to satisfy — it must be drawn
 * only where every contributing boolean is true — and here there is one boolean, `controls.plan.retime`.
 * A `name` would break that, needing `plan:rename` as well, which is why `retimePlan` cannot send one and
 * why the name is a separate form.
 *
 * ### Why it commits on a button rather than on blur
 *
 * The rail and group forms commit a name on blur, because a name is one field and a keystroke is not a
 * decision. Three fields that move every bar together are a decision: tabbing out of the start date on the
 * way to the sprint length would retime the plan twice and redraw it in between. So the three are held
 * locally and sent once, and only the ones that actually differ are sent — `TIMING_HINTS.unchanged` is what
 * a press with nothing changed says, rather than a 422 from a body the API would refuse as empty.
 *
 * The fields repaint from the plan the write answered, because the server decides the stored values: a
 * timezone the runtime cannot resolve is refused outright, and a start date is stored as sent.
 */
export function TimingForm({ planId, startDate, sprintLengthDays, timezone, retime }: TimingFormProps) {
  const [start, setStart] = useState(startDate)
  const [sprint, setSprint] = useState(sprintLengthDays)
  const [zone, setZone] = useState(timezone)
  const [problem, setProblem] = useState('')

  const send = async (): Promise<void> => {
    const timing = {
      ...(start === startDate ? {} : { startDate: start }),
      ...(sprint === sprintLengthDays ? {} : { sprintLengthDays: sprint }),
      ...(zone === timezone ? {} : { timezone: zone }),
    }
    if (Object.keys(timing).length === 0) {
      setProblem(TIMING_HINTS.unchanged)
      return
    }
    const result = await orNoAnswer(retime)(planId, timing)
    setProblem(result.ok ? TIMING_HINTS.cleared : result.detail)
  }

  return (
    <div className="grid gap-1">
      <div className={ROW}>
        <TimingFields
          onSprint={setSprint}
          onStart={setStart}
          onZone={setZone}
          sprintLengthDays={sprint}
          startDate={start}
          timezone={zone}
        />
        <Button onClick={() => void send()} size="sm" type="button">
          Retime
        </Button>
      </div>
      <p className="text-[12px] text-muted-foreground">{TIMING_WORDS.effect}</p>
      {problem === '' ? null : (
        <p className="text-[13px] text-destructive" role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
