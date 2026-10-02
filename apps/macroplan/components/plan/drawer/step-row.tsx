import type { ReactNode } from 'react'
import { STEPPER } from './field-css'
import { STEP_WORDS } from './step-value'

/** Props for {@link StepRow}. */
export interface StepRowProps {
  /** The small rendering, for a row of the items list rather than a field of the identity column. */
  readonly mini: boolean

  /** What the minus button is called, which is never the glyph on it. */
  readonly less: string

  /** What the plus button is called. */
  readonly more: string

  /** Whether stepping down is already at its floor, in which case the button says so. */
  readonly lessOff: boolean

  /** Whether stepping up is at its ceiling. */
  readonly moreOff: boolean

  /** Which way the pressed button moves: one step, signed. */
  readonly onStep: (delta: number) => void

  /** What sits between them: an estimate's input, or a sprint's disclosure. */
  readonly children: ReactNode
}

/**
 * Minus, something, plus — the one shape two different fields are built on.
 *
 * The estimate puts a number input in the middle and the sprint puts a disclosure there, and that is
 * the whole difference between them: both are "a value with a step either side", both are 34px with
 * hairline dividers, and neither should have to redraw that frame. The buttons carry real names
 * because `+` and the minus sign are glyphs rather than words, and a reader hearing "plus button" has
 * been told nothing about what it adds to.
 *
 * It takes no directive of its own: it holds no state and is imported only by client fields, which is
 * what puts it in the browser bundle. `../module-boundaries.test.tsx` asserts that the files which
 * *do* declare one are exactly the islands in its allowlist, so a helper like this one declaring
 * `use client` would be a failure rather than a precaution.
 */
export function StepRow({ mini, less, more, lessOff, moreOff, onStep, children }: StepRowProps) {
  const step = mini ? STEPPER.miniStep : STEPPER.step
  return (
    <div className={mini ? STEPPER.miniRow : STEPPER.row}>
      <button
        aria-label={less}
        className={step}
        disabled={lessOff}
        onClick={() => onStep(-1)}
        type="button"
      >
        {STEP_WORDS.minus}
      </button>
      {children}
      <button
        aria-label={more}
        className={step}
        disabled={moreOff}
        onClick={() => onStep(1)}
        type="button"
      >
        {STEP_WORDS.plus}
      </button>
    </div>
  )
}
