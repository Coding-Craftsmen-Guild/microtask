'use client'

import { ESTIMATE_NAME, EstimateBox, problemIdOf } from './estimate-box'
import { FIELD_CELL, FIELD_PROBLEM, MICRO } from './field-css'
import type { SubjectWrite } from './field'
import { useEstimate } from './use-estimate'
import type { SubjectKind } from './values'

const SR_ONLY = 'sr-only'

/** Props for {@link EstimateField}. */
export interface EstimateFieldProps {
  /** The plan the write is addressed at. */
  readonly planId: string

  /** The feature or item being sized. */
  readonly subjectId: string

  /** Which of the two, so the answered plan is re-read from the right array. */
  readonly kind: SubjectKind

  /** The authored estimate: days, `0` for a milestone, `null` for nothing sized. */
  readonly estimateDays: number | null

  /** The write, unbound, which the page read the credential for. */
  readonly estimate: SubjectWrite<number | null>

  /** The small rendering, which is how one row of the items list sizes its item. */
  readonly mini?: boolean

  /** What this estimate belongs to, which is how twenty mini steppers get twenty names. */
  readonly of?: string
}

/**
 * The estimate, as a stepper that can also be typed in.
 *
 * ### Why both a stepper and an input
 *
 * Half a day either way is almost every edit this field ever gets, and before this it cost a reader a
 * click into the box, a select-all, a retype and a blur. The buttons make that one press. What they do
 * **not** do is answer "make it 12", which is why the number stayed an `input` and not a read-out: a
 * stepper alone turns a two-key edit into twenty-four presses. `./use-estimate.ts` holds what the two
 * paths share, and argues why they commit at different moments.
 *
 * ### What it refuses before the API does
 *
 * `estimateEntry` is the one rule for both halves: halves only, nothing over the contract's maximum,
 * and text that is not a number refused rather than read as a clear. A `type="number"` input empties
 * its own value when it cannot parse one, which would make a typo over a real estimate read as "nobody
 * sized this" and delete it. `steppedDays` keeps the buttons inside the same range, so the floor of a
 * long press is a milestone and its ceiling is the contract's own.
 *
 * ### Why its rule is not under it
 *
 * The fields are a wrapping row of 34px controls and a paragraph in any one cell would stretch that cell
 * to the paragraph's width, so the rule is one sentence under the **row** and this field names it as its
 * description instead ({@link FIELDS_HINT_ID}).
 *
 * ### Two sizes, one control
 *
 * `mini` is the items list's rendering: the same control at 24px, no label, and its name built from the
 * item it belongs to — a column of them needs twenty distinct names, and "Estimate in days" twenty times
 * over is a column a screen reader cannot navigate. A refusal there is the box's `title` and an `sr-only`
 * alert rather than a sentence, the row being one line of a list.
 */
export function EstimateField(props: EstimateFieldProps) {
  const { estimateDays, subjectId, mini = false, of = '' } = props
  const state = useEstimate(props)
  const fieldId = `plan-drawer-estimate-${subjectId}`
  const box = (
    <EstimateBox
      estimateDays={estimateDays}
      fieldId={fieldId}
      mini={mini}
      of={of}
      state={state}
    />
  )
  const said =
    state.problem === '' ? null : (
      <p
        className={mini ? SR_ONLY : FIELD_PROBLEM}
        id={mini ? undefined : problemIdOf(fieldId)}
        role="alert"
      >
        {state.problem}
      </p>
    )
  if (mini) {
    return (
      <>
        {box}
        {said}
      </>
    )
  }
  return (
    <div className={FIELD_CELL} data-slot="estimate-field">
      <label className={MICRO} htmlFor={fieldId}>
        {ESTIMATE_NAME}
      </label>
      {box}
      {said}
    </div>
  )
}
