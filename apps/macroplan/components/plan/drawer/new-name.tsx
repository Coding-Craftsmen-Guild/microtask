import type { Plan } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import { LIMITS } from '@repo/contracts'
import { Button } from '@repo/ui/components/button'
import { useRef, useState, type FormEvent } from 'react'
import type { ActionResult } from '../../../actions/result'
import { FIELD, NEEDS_A_NAME } from './field'
import { FieldShell } from './field-shell'

const FORM = 'grid justify-items-start gap-1'

/** Props for {@link NewName}. */
export interface NewNameProps {
  /** The control's own id, which every id {@link FieldShell} derives is built from. */
  readonly fieldId: string

  /** The caption over the box, which is its accessible name and says what is being added. */
  readonly label: string

  /** The quiet line under it: where the new thing lands, there being no placement to offer. */
  readonly hint: string

  /** The submit button's label, which must name **which** of the two this box adds. */
  readonly action: string

  /** Sends the name as the draft its caller built around it, and answers the plan or the refusal. */
  readonly add: (name: string) => Promise<ActionResult<Plan>>
}

/**
 * One box a new feature or a new item is named in, and the submit that creates it.
 *
 * ### A submit, where every other control in this drawer commits on blur
 *
 * The blur idiom is right for editing a value that already exists: the worst case is the same value
 * sent twice. It is wrong here — a half-typed name tabbed past would become a feature, and the only way
 * back is the delete two bands down. So this is a one-field `<form>`: Enter submits it natively, the
 * button is the same gesture for a pointer, and nothing is created by leaving the box.
 *
 * An empty box is **refused** rather than ignored ({@link NEEDS_A_NAME}). `EntityName` is
 * `.trim().min(1)`, so a blank name is a 422 whose detail is the API's generic one, and a submit that
 * quietly did nothing is indistinguishable from one that failed. The value is trimmed here for the same
 * reason the contract trims it, and `maxLength` is `LIMITS.nameLength` as `./name-field.tsx` sets it:
 * `cleanName` truncates past that and the route answers **200**, so a longer name the box let through
 * would be stored shortened and reported as a success.
 *
 * ### No `'use client'`, and the boundary is its caller
 *
 * It holds state, so it runs in the browser — and it reaches the browser because
 * `./create-controls.tsx`, which is a client module, imports it. A directive here would put a second
 * name in `../module-boundaries.test.tsx`'s allowlist for a boundary that is not here: what crosses is
 * `CreateControls`' props, and `add` is a closure built **in** the browser around one action and one
 * parent id, which is the shape that could not have crossed a boundary at all — React's rule, stated in
 * no ADR.
 * `./field-shell.tsx` carries the same note for the same reason.
 *
 * The box empties on success and nothing is read back, which is the one place the field idiom does not
 * apply: the thing created is not this panel's subject, so there is no value here to re-read. What puts
 * it on screen is the `refresh()` `adminWrite` calls on every successful write
 * (`actions/plan-write.ts`). A refusal leaves what was typed where it is, to be fixed and sent again.
 */
export function NewName({ fieldId, label, hint, action, add }: NewNameProps) {
  const box = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const commit = async () => {
    const name = (box.current?.value ?? '').trim()
    if (name === '') {
      setProblem(NEEDS_A_NAME)
      return
    }
    const result = await orNoAnswer(add)(name)
    setProblem(result.ok ? '' : result.detail)
    if (result.ok && box.current !== null) box.current.value = ''
  }
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void commit()
  }
  return (
    <form className={FORM} onSubmit={submit}>
      <FieldShell fieldId={fieldId} hint={hint} label={label} problem={problem}>
        {(wiring) => (
          <input {...wiring} className={FIELD} maxLength={LIMITS.nameLength} ref={box} type="text" />
        )}
      </FieldShell>
      <Button size="sm" type="submit">
        {action}
      </Button>
    </form>
  )
}
