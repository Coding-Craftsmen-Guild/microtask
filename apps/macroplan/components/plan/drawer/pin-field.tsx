'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { rangeOfSprint } from '@repo/schedule'
import type { PlanCalendar } from '@repo/schedule'
import { useEffect, useRef, useState } from 'react'
import { commitKeys, paintUnfocused, pinEntry, FIELD, PIN_HINT, type SubjectWrite } from './field'
import { FieldShell } from './field-shell'
import { subjectValues } from './values'

const FIELD_ID = 'plan-drawer-pin'

const shown = (sprint: number | null): string => (sprint === null ? '' : String(sprint + 1))

/**
 * The quiet line under a pin field: the dates the sprint in the box actually means.
 *
 * A bare index is not a date, and a pin is the one value in this drawer a reader cannot check against
 * the world without being told what it stands for. So the hint is the sprint's own first and last day,
 * recomputed from whatever is in the box rather than only from what was last committed — and the rule
 * whenever the box holds nothing datable, which is an empty field or one {@link pinEntry} refuses.
 *
 * **`rangeOfSprint` is the one inclusive range in `@repo/schedule`, and this depends on that.** Its
 * `to` is the sprint's last working day, where `Span.endDay` everywhere else in that package is "the
 * first working-day offset **not** included in this span" (`packages/schedule/src/structure.ts`). Its
 * own note says so, and `sprints.test.ts` demonstrates it twice without reference to the note: sprint 0
 * of a ten-day sprint starting Monday `2026-09-21` answers `to: '2026-10-02'`, the Friday of the week
 * after and the tenth working day, and a one-day sprint answers the same date at both ends. Reading
 * `to` as exclusive would print every pin one day short, which is the kind of wrong a reader checks
 * against a calendar and then distrusts the whole screen for.
 *
 * The sprint is labelled `+ 1` here for the reason {@link pinEntry} converts: `S1` is what the table
 * calls the plan's first sprint, and this sentence sits under a box counted the same way.
 *
 * `calendar.timezone` is required by `PlanCalendar` and read by neither this nor `rangeOfSprint`:
 * `dayToDate` carries every date as a UTC midnight instant advanced by whole days, and
 * `packages/schedule/src/calendar.ts` states a plan's zone "is read by `todayIn` and by nothing else".
 * So these dates are the same in every zone — it is passed through rather than faked so that a
 * `rangeOfSprint` which one day did read it would be right here instead of quietly wrong.
 *
 * @param typed - Exactly what the field holds, counted from 1.
 * @param calendar - The plan's own calendar, which is what turns a sprint into two dates.
 * @returns The sprint's inclusive range in words, or {@link PIN_HINT} when there is nothing to date.
 */
export const pinHint = (typed: string, calendar: PlanCalendar): string => {
  const entry = pinEntry(typed, calendar.sprintLengthDays)
  if (entry.kind === 'refused' || entry.sprint === null) return PIN_HINT
  const range = rangeOfSprint(entry.sprint, calendar)
  return `Sprint ${String(entry.sprint + 1)} runs ${range.from} to ${range.to}, both days included. A pin only delays a feature; it never moves one earlier.`
}

/** Props for {@link PinField}. */
export interface PinFieldProps {
  /** The plan this feature belongs to, which every write is addressed at. */
  readonly planId: string

  /** The feature's own id. There is no item form of this control, `PlanItem` carrying no pin. */
  readonly featureId: string

  /** The stored pin as a **0-based** sprint index, or `null` for a feature that is not pinned. */
  readonly pinSprint: number | null

  /** Sends the new pin — `null` unpins — and answers the plan, or why it was refused. */
  readonly pin: SubjectWrite<number | null>

  /** The plan's first day, from which sprint 1 starts on it or on the next working day. */
  readonly startDate: string

  /** How many working days one of this plan's sprints is, which also fixes this field's ceiling. */
  readonly sprintLengthDays: number

  /** The plan's zone, carried because `PlanCalendar` names it and read by nothing ({@link pinHint}). */
  readonly timezone: string
}

/**
 * Which sprint a feature may not start before, shown as the dates that sprint actually is.
 *
 * ### A separate control because it is a separate authority
 *
 * `feature:pin` is granted to `manage`, where `feature:rename` and `feature:estimate` beside it are
 * granted to `write` (`MANAGE` and `WRITE` in `packages/kernel/src/access/policy.ts`).
 * `PATCH …/features/{featureId}` authorises **every field its body carries** and the first refusal
 * writes none of them, so a form posting a name and a pin together would hand a `write` seat a 403 for
 * the pin and lose the rename it was allowed. One field, one request, one boolean: this is drawn on
 * `controls.pinFeature` and sends `pinFeature` alone (`lib/plan-capabilities.ts`,
 * `actions/features.ts`). The API is still the gate, asked again at the instant of the blur, and a seat
 * re-roled in between meets its 403 as the sentence under this box (ADR 0038).
 *
 * ### The box is counted from 1 and the field it writes is counted from 0
 *
 * `pinSprint` is a 0-based `SprintIndex`, and `S1` is what the table calls the plan's first sprint —
 * `sprintOf`'s own note says "0-based; a UI adds one to label it" (`packages/schedule/src/sprints.ts`).
 * Showing the stored number would put a `2` in this box beside a table cell reading `S3`, so
 * {@link pinEntry} converts in one place and refuses a typed `0`: there is no sprint 0 on this screen,
 * and a `0` in a box counted from 1 is the off-by-one arriving rather than a value.
 *
 * ### The ceiling is this field's, because the contract does not have one
 *
 * `SprintIndex` is `z.number().int().min(0)` with **no** maximum, and its own note argues for that: a
 * plan's sprint count falls out of the schedule rather than being authored, so the store has nothing to
 * check a pin against. The consequence is that `500` typed where `50` was meant is stored and reported
 * as success — and a pin is the only way a fixed point in time enters the model (spec §3.1), so the
 * feature moves a decade out with nothing anywhere saying so. {@link pinEntry} refuses past
 * `pinCeiling`, derived from `MAX_ESTIMATE_DAYS` and this plan's own sprint length, and it refuses
 * rather than clamps: a silently corrected pin is a different plan than the one that was typed.
 *
 * ### The dates, and the one inclusive boundary in `@repo/schedule`
 *
 * {@link pinHint} is the line under the box, and it is where the `rangeOfSprint` call and the reason
 * its `to` is a **last day** rather than a first-excluded one both live. It is recomputed from what the
 * box holds on every keystroke, so a pin is read as dates before it is committed rather than after.
 *
 * ### Everything else is the drawer's field idiom
 *
 * A text input with `inputMode="numeric"` rather than `type="number"`, because the HTML sanitisation
 * algorithm empties a number input it cannot parse and this field must not read a typo as an unpin.
 * Commit on Enter or blur, revert on Escape, a refusal that leaves what was typed on screen so it can
 * be fixed, and a blur that sends nothing still clearing a standing refusal. What is on screen after a
 * write is what the **server** stored, read back out of the answered plan by `subjectValues` and never
 * assumed from what was sent. `./name-field.tsx` and `./estimate-field.tsx` argue each of those, and
 * this field adds one line to the idiom: the hint depends on what is being typed, so the text is held
 * in state as well as in the uncontrolled box — the box stays the authority on what the user sees, and
 * the state is only what the sentence under it is derived from.
 *
 * That is why both writes here **paint first and then read the box**, rather than setting the state to
 * the same string they painted. `paintUnfocused` deliberately leaves a focused box alone, so a value it
 * declined to write is a value that is not on screen; a state set to it anyway would date a sprint the
 * reader cannot see — a re-render or a late answer arriving mid-typing would leave the box showing `5`
 * and the line under it naming sprint 1. Reading `field.current.value` back keeps the one authority one
 * authority, whichever of the two the paint chose.
 */
export function PinField({ planId, featureId, pinSprint, pin, startDate, sprintLengthDays, timezone }: PinFieldProps) {
  const field = useRef<HTMLInputElement>(null)
  const stored = useRef(pinSprint)
  const [problem, setProblem] = useState('')
  const [typed, setTyped] = useState(shown(pinSprint))
  useEffect(() => {
    stored.current = pinSprint
    paintUnfocused(field.current, shown(pinSprint))
    setTyped(field.current?.value ?? shown(pinSprint))
  }, [pinSprint])
  const commit = async (input: HTMLInputElement) => {
    const entry = pinEntry(input.value, sprintLengthDays)
    if (entry.kind === 'refused') {
      setProblem(entry.detail)
      return
    }
    if (entry.sprint !== stored.current) {
      const result = await orNoAnswer(pin)(planId, featureId, entry.sprint)
      const kept = result.ok ? subjectValues(result.value, 'feature', featureId) : undefined
      if (kept !== undefined) stored.current = kept.pinSprint
      setProblem(result.ok ? '' : result.detail)
    } else setProblem('')
    paintUnfocused(field.current, shown(stored.current))
    setTyped(field.current?.value ?? shown(stored.current))
  }
  return (
    <FieldShell
      fieldId={FIELD_ID}
      hint={pinHint(typed, { startDate, sprintLengthDays, timezone })}
      label="Pinned to sprint"
      problem={problem}
    >
      {(wiring) => (
        <input
          {...wiring}
          className={FIELD}
          defaultValue={shown(pinSprint)}
          inputMode="numeric"
          onBlur={(event) => void commit(event.currentTarget)}
          onChange={(event) => setTyped(event.currentTarget.value)}
          onKeyDown={(event) => commitKeys(event, shown(stored.current))}
          ref={field}
          type="text"
        />
      )}
    </FieldShell>
  )
}
