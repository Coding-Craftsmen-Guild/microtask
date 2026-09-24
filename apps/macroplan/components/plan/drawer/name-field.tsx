'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { LIMITS } from '@repo/contracts'
import { useEffect, useRef, useState } from 'react'
import {
  commitKeys,
  paintUnfocused,
  subjectValues,
  FIELD,
  LABEL,
  PROBLEM,
  type SubjectKind,
  type SubjectWrite,
} from './field'

const GROUP = 'grid gap-1'

const FIELD_ID = 'plan-drawer-name'

const NAMES: Readonly<Record<SubjectKind, string>> = { feature: 'Feature name', item: 'Item name' }

const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim()

/** Props for {@link NameField}. */
export interface NameFieldProps {
  /** The plan this subject belongs to, which every write is addressed at. */
  readonly planId: string

  /** The feature id or the item id, whichever kind this is. */
  readonly subjectId: string

  /** Which of the two this is, which decides the label and where the answer is read back from. */
  readonly kind: SubjectKind

  /** The name as the server last stored it. */
  readonly name: string

  /** Sends the rename and answers the plan it produced, or why it was refused. */
  readonly rename: SubjectWrite<string>
}

/**
 * A feature's or an item's name, edited in place by the rules the field idiom already fixed.
 *
 * `apps/microtask/components/task-tree/inline-name.tsx` is the model and this follows it: Enter and
 * Escape both commit by leaving the field, leaving it commits, and a value that is empty or unchanged
 * once whitespace is collapsed restores the stored name **with no request**. There is no
 * `useTransition` — one exists in this repo, in `create-project.tsx`, and it is there to disable a
 * submit button; a field that commits on blur has nothing to disable, and a pending flag would only
 * be a second thing to keep in step with the answer.
 *
 * **What is on screen after a write is what the server stored**, which is not the same string as the
 * one typed: `cleanName` collapses whitespace and truncates at `LIMITS.nameLength`, so the answer is
 * read back out of the plan the action returned ({@link subjectValues}) rather than assumed. The input
 * is uncontrolled and every write to it goes through {@link paintUnfocused}, so neither a re-render
 * nor the late answer to a commit the user has already moved past can overwrite what is being typed.
 * The effect below repaints on a **prop** change for a reason a drawer makes real: moving from
 * `/f/<a>` to `/f/<b>` is a soft navigation that re-renders this same component instance with another
 * subject's name, and `defaultValue` is read once.
 *
 * The refusal is an inline `role="alert"` line. This repo has no `react-hook-form`, no Zod resolver,
 * no `Form`/`FormField` in `@repo/ui` and no `toast()` call anywhere — `packages/ui` does vendor a
 * Sonner `Toaster`, and nothing in either app has ever mounted it — so a sentence under the field is
 * the house answer rather than the minimal one. It sits outside the `<label>`, which is why this field
 * labels by `htmlFor` and not by wrapping: a refusal inside the label would become part of the input's
 * accessible name, and the field would be called "Feature name No." while it was being fixed.
 *
 * `rename` is called through `orNoAnswer`, so a rename the server never answers restores the stored
 * name and says so like any other refusal, whichever surface handed the action in.
 */
export function NameField({ planId, subjectId, kind, name, rename }: NameFieldProps) {
  const field = useRef<HTMLInputElement>(null)
  const stored = useRef(name)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    stored.current = name
    paintUnfocused(field.current, name)
  }, [name])
  const commit = async (input: HTMLInputElement) => {
    const next = collapse(input.value)
    if (next !== '' && next !== stored.current) {
      const result = await orNoAnswer(rename)(planId, subjectId, next)
      const kept = result.ok ? subjectValues(result.value, kind, subjectId) : undefined
      if (kept !== undefined) stored.current = kept.name
      setProblem(result.ok ? '' : result.detail)
    }
    paintUnfocused(field.current, stored.current)
  }
  return (
    <div className={GROUP}>
      <label className={LABEL} htmlFor={FIELD_ID}>
        {NAMES[kind]}
      </label>
      <input
        className={FIELD}
        defaultValue={name}
        id={FIELD_ID}
        maxLength={LIMITS.nameLength}
        onBlur={(event) => void commit(event.currentTarget)}
        onKeyDown={(event) => commitKeys(event, stored.current)}
        ref={field}
        spellCheck={false}
        type="text"
      />
      {problem === '' ? null : (
        <p className={PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
