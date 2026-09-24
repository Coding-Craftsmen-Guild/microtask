'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useEffect, useRef, useState } from 'react'
import {
  commitKeys,
  estimateEntry,
  paintUnfocused,
  ESTIMATE_HINT,
  FIELD,
  type SubjectWrite,
} from './field'
import { FieldShell } from './field-shell'
import { subjectValues, type SubjectKind } from './values'

const FIELD_ID = 'plan-drawer-estimate'

const shown = (days: number | null): string => (days === null ? '' : String(days))

/** Props for {@link EstimateField}. */
export interface EstimateFieldProps {
  /** The plan this subject belongs to, which every write is addressed at. */
  readonly planId: string

  /** The feature id or the item id, whichever kind this is. */
  readonly subjectId: string

  /** Which of the two this is, which decides where the answer is read back from. */
  readonly kind: SubjectKind

  /** The **authored** estimate as stored: days, `0` for a milestone, `null` for nothing sized. */
  readonly estimateDays: number | null

  /** Sends the new estimate — `null` clears it — and answers the plan, or why it was refused. */
  readonly estimate: SubjectWrite<number | null>
}

/**
 * The authored estimate, in the three states the field really has.
 *
 * Empty means `null`, **nothing was sized**; `0` is a milestone, a real estimate meaning no time; a
 * number is that many working days. `packages/contracts/src/plan.ts` is where the pair is fixed —
 * "`estimateDays` is nullable rather than defaulted to zero, because zero is a real answer" — and
 * `effectiveEstimate` reads it with `=== null` precisely so that three items sized at 0 answer 0
 * rather than resurrecting a feature's authored 40. So `0` → empty and empty → `0` are two different
 * commits, and both are sent: the string idiom this drawer's name field follows, where an empty box
 * means "no change, send nothing", cannot express either of them. What means "no change" here is a
 * value **equal to the one stored**, which is checked against the number rather than the text, so
 * `007` over a stored `7` is no change either.
 *
 * `inputMode="numeric"` on a text input rather than `type="number"`, and that is a correctness
 * decision rather than a style one: the HTML sanitisation algorithm empties a number input whose
 * content is not a valid floating-point number, so `2.5x` reads back as `''` — which this field must
 * treat as a clear. A typo would delete a real estimate and report success. Keeping the text means
 * {@link estimateEntry} can refuse it and say what a day is instead, which is the same reason the
 * negative and the fraction are refused here rather than sent for the API to answer 422 with its own
 * generic sentence.
 *
 * **A refusal leaves what was typed on screen.** It is the one thing the user still needs in order to
 * fix it, where a refused *write* restores the stored value because the server is the authority on
 * what that is — read back out of the answered plan by `subjectValues` (`./values.ts`), never assumed
 * from what was sent. Everything else is the drawer's field idiom: commit on Enter or blur, revert on
 * Escape, an inline `role="alert"` the shell points `aria-describedby` at, and no `useTransition`
 * (`./name-field.tsx` argues all of it). The hint under the box is always there and the refusal only
 * while it stands, and {@link FieldShell} names both in that order, so a reader tabbing back to a
 * refused field hears the rule **and** what was refused about it.
 */
export function EstimateField({ planId, subjectId, kind, estimateDays, estimate }: EstimateFieldProps) {
  const field = useRef<HTMLInputElement>(null)
  const stored = useRef(estimateDays)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    stored.current = estimateDays
    paintUnfocused(field.current, shown(estimateDays))
  }, [estimateDays])
  const commit = async (input: HTMLInputElement) => {
    const entry = estimateEntry(input.value)
    if (entry.kind === 'refused') {
      setProblem(entry.detail)
      return
    }
    if (entry.days !== stored.current) {
      const result = await orNoAnswer(estimate)(planId, subjectId, entry.days)
      const kept = result.ok ? subjectValues(result.value, kind, subjectId) : undefined
      if (kept !== undefined) stored.current = kept.estimateDays
      setProblem(result.ok ? '' : result.detail)
    } else setProblem('')
    paintUnfocused(field.current, shown(stored.current))
  }
  return (
    <FieldShell fieldId={FIELD_ID} hint={ESTIMATE_HINT} label="Estimate in days" problem={problem}>
      {(wiring) => (
        <input
          {...wiring}
          className={FIELD}
          defaultValue={shown(estimateDays)}
          inputMode="numeric"
          onBlur={(event) => void commit(event.currentTarget)}
          onKeyDown={(event) => commitKeys(event, shown(stored.current))}
          ref={field}
          type="text"
        />
      )}
    </FieldShell>
  )
}
