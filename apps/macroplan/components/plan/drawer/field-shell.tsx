import type { ReactNode } from 'react'
import { BUDGET, LABEL, PROBLEM } from './field'

const GROUP = 'grid gap-1'

/**
 * What a field's own control must carry for its label, its hint and its refusal to reach a reader.
 *
 * Handed to the control rather than applied to it, because the control is the one part of a field
 * that differs — an `<input>` here, a `<textarea>` there, a checkbox or a `<select>` in a group not
 * yet written — and a shell that cloned its child to set attributes on it would be deciding what
 * that child is.
 */
export interface FieldWiring {
  /** The id the `<label htmlFor>` above names, so the control has exactly one accessible name. */
  readonly id: string

  /** The hint, the refusal, both or neither, in reading order — `undefined` when there is nothing. */
  readonly 'aria-describedby': string | undefined

  /** `true` only while a refusal stands, so a reader is told the value was not accepted. */
  readonly 'aria-invalid': boolean | undefined
}

/** Props for {@link FieldShell}. */
export interface FieldShellProps {
  /** The control's own id, which every id this shell derives is built from. */
  readonly fieldId: string

  /** The caption over the field, which is the control's accessible name and nothing else's. */
  readonly label: string

  /** The quiet line under the control — a rule, or a remaining budget — or `null` for no line. */
  readonly hint: string | null

  /** The refusal to show, `''` for none, which is also what decides `aria-invalid`. */
  readonly problem: string

  /** The control itself, built from the wiring this shell derives for it. */
  readonly children: (wiring: FieldWiring) => ReactNode
}

/**
 * The four parts every field in this drawer is made of, and the accessibility wiring between them.
 *
 * A `GROUP` wrapper, a `<label htmlFor>`, the control, and up to two lines under it: the quiet hint
 * and the `role="alert"` refusal. Each field repeated all four before this existed, which is a dozen
 * lines apiece and — more to the point — four copies of one accessibility decision. The next control
 * group to arrive gets it by construction instead of by imitation.
 *
 * ### Why the label is `htmlFor` and the refusal is outside it
 *
 * A refusal inside the `<label>` would become part of the control's accessible **name**, and the field
 * would be called "Feature name No." while it was being fixed (`./name-field.tsx` argues it). So the
 * label names the control by id and the refusal is referenced as its **description** instead — which
 * is the half that was missing: a user tabbing back to a refused field heard the hint, or nothing at
 * all, and was never told the value had been refused. `aria-describedby` lists the hint and the
 * refusal in reading order and only while each exists, and `aria-invalid` is set exactly while the
 * refusal stands, so neither attribute can point at an element that is not rendered.
 *
 * `plan-screen.tsx` is the idiom followed here: a constant id, an element that owns it, and
 * `aria-describedby` naming it — never a description invented from the text.
 *
 * ### No `'use client'`, deliberately
 *
 * This declares nothing the browser needs: no state, no effect, no handler. It reaches the browser
 * because the three fields that import it are client modules, which is what puts a module in that
 * bundle — a directive here would put a fourth name in `module-boundaries.test.tsx`'s allowlist for a
 * boundary that is not here. The boundary is each field, and the props crossing it are each field's.
 */
export function FieldShell({ fieldId, label, hint, problem, children }: FieldShellProps) {
  const hintId = `${fieldId}-hint`
  const problemId = `${fieldId}-problem`
  const described = [hint === null ? '' : hintId, problem === '' ? '' : problemId]
    .filter((one) => one !== '')
    .join(' ')
  return (
    <div className={GROUP}>
      <label className={LABEL} htmlFor={fieldId}>
        {label}
      </label>
      {children({
        'aria-describedby': described === '' ? undefined : described,
        'aria-invalid': problem === '' ? undefined : true,
        id: fieldId,
      })}
      {hint === null ? null : (
        <p className={BUDGET} id={hintId}>
          {hint}
        </p>
      )}
      {problem === '' ? null : (
        <p className={PROBLEM} id={problemId} role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
