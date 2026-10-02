import { STEPPER } from './field-css'
import { commitKeys } from './field'
import { FIELDS_HINT_ID } from './panel-words'
import { StepRow } from './step-row'
import { shownDays, STEP_WORDS } from './step-value'
import type { EstimateState } from './use-estimate'

const NAME = 'Estimate in days'

/** Where the refusal under a full-size estimate field is, so the box can name it as a description. */
export const problemIdOf = (fieldId: string): string => `${fieldId}-problem`

/** Props for {@link EstimateBox}. */
export interface EstimateBoxProps {
  /** The small rendering, for a row of the items list. */
  readonly mini: boolean

  /** What this estimate belongs to, or `''` for the field that has a label of its own. */
  readonly of: string

  /** The input's id, which the label above names. Unused in the mini rendering, which has no label. */
  readonly fieldId: string

  /** The authored estimate as stored, which seeds the box. */
  readonly estimateDays: number | null

  /** The write and the refusal, from `./use-estimate.ts`. */
  readonly state: EstimateState
}

/**
 * Minus, a number, plus — the part of an estimate field that is the same at both sizes.
 *
 * Both renderings put the same input between the same two buttons, and the only differences are the
 * paint and how the control is named: the field has a label above it and points at the row's own hint,
 * the mini has an `aria-label` built from the item it sizes and carries its refusal as a `title`. Having
 * one element for both is what stops the two from drifting into two ways of sending an estimate.
 */
export function EstimateBox({ mini, of, fieldId, estimateDays, state }: EstimateBoxProps) {
  const named = (word: string): string => (of === '' ? word : `${word} for ${of}`)
  const refused = state.problem !== ''
  const described = [FIELDS_HINT_ID, refused ? problemIdOf(fieldId) : ''].filter((one) => one !== '')
  return (
    <StepRow
      less={named(STEP_WORDS.less)}
      lessOff={false}
      mini={mini}
      more={named(STEP_WORDS.more)}
      moreOff={false}
      onStep={state.step}
    >
      <input
        aria-describedby={mini ? undefined : described.join(' ')}
        aria-invalid={refused ? true : undefined}
        aria-label={mini ? named(NAME) : undefined}
        className={mini ? STEPPER.miniValue : STEPPER.value}
        defaultValue={shownDays(estimateDays)}
        id={mini ? undefined : fieldId}
        inputMode="decimal"
        onBlur={(event) => state.commit(event.currentTarget)}
        onKeyDown={(event) => commitKeys(event, state.shown())}
        ref={state.field}
        title={mini && refused ? state.problem : undefined}
        type="text"
      />
    </StepRow>
  )
}

/** The name an estimate field answers to, which both renderings build from. */
export const ESTIMATE_NAME = NAME
