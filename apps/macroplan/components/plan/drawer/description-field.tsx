'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useEffect, useRef, useState } from 'react'
import {
  budgetLine,
  descriptionBytes,
  normalisedDescription,
  overBudget,
  paintUnfocused,
  FIELD,
  OVER_BUDGET,
  type SubjectWrite,
} from './field'
import { FieldShell } from './field-shell'

const FIELD_ID = 'plan-drawer-description'

const bytesOf = (typed: string): number => descriptionBytes(normalisedDescription(typed))

/** Props for {@link DescriptionField}. */
export interface DescriptionFieldProps {
  /** The plan the item belongs to, which the write is addressed at. */
  readonly planId: string

  /** The item whose own file holds this text. */
  readonly itemId: string

  /** The description as the server last stored it, read from the item's own file. */
  readonly description: string

  /** Replaces the description in full and answers the plan, or why it was refused. */
  readonly describe: SubjectWrite<string>
}

/**
 * An item's description, counted in the unit its cap is written in.
 *
 * ### Why it counts bytes, and why it refuses rather than sending
 *
 * The cap is 8,192 **UTF-8 bytes** and the domain **truncates** rather than refusing:
 * `cleanDescription` shortens anything over it at the last whole code point and the route answers
 * **200** (`packages/macroplan-domain/src/limits.ts`). So a field that just sent the text would be
 * told it succeeded while the tail of what was written was dropped, and the only way to find out is to
 * read the item back. Refusing before sending is the one thing that turns that into something the user
 * is told, which is why this is the field that decides a limit for itself.
 *
 * The count is `new TextEncoder().encode(value).length` and never `value.length`: that counts UTF-16
 * units, and **no character encodes to fewer UTF-8 bytes than UTF-16 units**, so a `.length` check can
 * only ever under-report. It lets through exactly the strings that get truncated — 2,049 emoji are
 * 8,196 bytes and read as 4,098 — which is the one thing this field exists to prevent.
 *
 * The budget is on screen from the first keystroke rather than only once it is exceeded, because the
 * thing being prevented is invisible: a user who learns about the cap when the text is already past it
 * has already written the part that would be dropped. It is the shell's `hint`, which is the same slot
 * the estimate field states its rule in, so the box has one quiet line under it either way.
 *
 * ### The one field whose answer cannot be read back
 *
 * `describeItem` answers the **plan**, and a plan carries no descriptions — `PlanManifest` is
 * "everything about a plan except its item descriptions", which live in each item's own file. So
 * unlike the name and the estimate beside it, this field cannot show what the server stored: it shows
 * what it sent, and it is only entitled to do that while it sends nothing the server would change.
 *
 * `cleanDescription` changes three things and the byte cap is only the third. The other two are a CRLF
 * normalisation and a stripped control-character set, and they are what `normalisedDescription`
 * (`./field.ts`) applies here **before** the comparison, the count and the send: a pasted `U+000B` was
 * otherwise stored stripped while this box went on showing it and reporting success, which is the exact
 * failure this rule exists to prevent. What is sent is what the box is then repainted with, so the two
 * cannot disagree. The truncation is the one of the three that is refused rather than applied, because
 * it is the one that loses what somebody wrote.
 *
 * Whitespace is still neither trimmed nor collapsed, and that is unchanged: the domain does not either,
 * so there is nothing to disagree about.
 *
 * It commits on blur and **not on Enter**, which in a `<textarea>` is a newline the user meant. That
 * is the one place this field departs from the drawer's field idiom (`./name-field.tsx`).
 */
export function DescriptionField({ planId, itemId, description, describe }: DescriptionFieldProps) {
  const box = useRef<HTMLTextAreaElement>(null)
  const stored = useRef(description)
  const [bytes, setBytes] = useState(() => descriptionBytes(description))
  const [problem, setProblem] = useState('')
  useEffect(() => {
    stored.current = description
    paintUnfocused(box.current, description)
    setBytes(descriptionBytes(description))
  }, [description])
  const commit = async (typed: string) => {
    const next = normalisedDescription(typed)
    setBytes(descriptionBytes(next))
    if (next === stored.current) {
      setProblem('')
      paintUnfocused(box.current, next)
      return
    }
    if (overBudget(descriptionBytes(next))) {
      setProblem(OVER_BUDGET)
      return
    }
    const result = await orNoAnswer(describe)(planId, itemId, next)
    if (result.ok) {
      stored.current = next
      paintUnfocused(box.current, next)
    }
    setProblem(result.ok ? '' : result.detail)
  }
  return (
    <FieldShell fieldId={FIELD_ID} hint={budgetLine(bytes)} label="Description" problem={problem}>
      {(wiring) => (
        <textarea
          {...wiring}
          className={FIELD}
          defaultValue={description}
          onBlur={(event) => void commit(event.currentTarget.value)}
          onChange={(event) => setBytes(bytesOf(event.currentTarget.value))}
          ref={box}
          rows={4}
        />
      )}
    </FieldShell>
  )
}
