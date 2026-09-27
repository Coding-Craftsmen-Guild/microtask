import type { Ref } from 'react'
import { PROBLEM } from './field'

const BOX = 'size-4 shrink-0'

const ROW = 'flex items-center gap-2 text-[13px]'

const NAME = 'min-w-0 flex-1 cursor-pointer truncate'

const REFUSAL = 'truncate text-[12px] text-muted-foreground'

const GROUP = 'grid gap-0.5'

/** Props for {@link DependencyRow}. */
export interface DependencyRowProps {
  /** The dom id the box and its label are joined by, and the stem of the two message ids. */
  readonly fieldId: string

  /** The candidate's name, beside its box. */
  readonly name: string

  /** Whether this feature already waits on the candidate. */
  readonly ticked: boolean

  /**
   * Why a click would be refused, on one line with the whole of it on hover, or `null` for none.
   *
   * Still the box's accessible description, because a reader hearing why a click will be refused
   * wants all of it. What it no longer does is wrap to three lines under every row: on a plan where
   * most features are transitively linked nearly every candidate carries one.
   */
  readonly refusal: string | null

  /** What the last click was answered with, or `''` while there is nothing to say. */
  readonly problem: string

  /** Called when the box is clicked, which is what writes the whole list. */
  readonly onToggle: () => void

  /** The box itself, so its owner can paint it from the answer rather than from React state. */
  readonly boxRef: Ref<HTMLInputElement>
}

/**
 * One candidate as a row: a box, its name, and whatever there is to say about clicking it.
 *
 * Markup only. `DependencyToggle` owns the write and hands this what to draw, which is what keeps
 * either of them inside this repo's fifty-line cap on a function.
 *
 * It declares no `'use client'` of its own. The only thing that renders it is a client component, so
 * it is already on the client side of the boundary, and a directive here would put a second name in
 * the allowlist `module-boundaries.test.tsx` keeps exact for no gain.
 */
export function DependencyRow(props: DependencyRowProps) {
  const { fieldId, name, ticked, refusal, problem, onToggle, boxRef } = props
  const hintId = `${fieldId}-hint`
  const problemId = `${fieldId}-problem`
  const described = [refusal === null ? '' : hintId, problem === '' ? '' : problemId]
    .filter((one) => one !== '')
    .join(' ')
  return (
    <div className={GROUP}>
      <div className={ROW}>
        <input
          aria-describedby={described === '' ? undefined : described}
          aria-invalid={problem === '' ? undefined : true}
          className={BOX}
          defaultChecked={ticked}
          id={fieldId}
          onChange={onToggle}
          ref={boxRef}
          type="checkbox"
        />
        <label className={NAME} htmlFor={fieldId}>
          {name}
        </label>
      </div>
      {refusal === null ? null : (
        <p className={REFUSAL} id={hintId} title={refusal}>
          {refusal}
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
