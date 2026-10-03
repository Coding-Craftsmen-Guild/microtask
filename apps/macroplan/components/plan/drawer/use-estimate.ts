import { orNoAnswer } from '@repo/app-session/no-answer'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { estimateEntry, paintUnfocused, type SubjectWrite } from './field'
import { shownDays, steppedDays, STEP_DAYS } from './step-value'
import type { SubjectKind } from './values'

/** What one estimate field needs to write and re-read its own subject. */
export interface EstimateQuery {
  /** The plan the write is addressed at. */
  readonly planId: string

  /** The feature or item being sized. */
  readonly subjectId: string

  /** Which of the two: a feature or an item. */
  readonly kind: SubjectKind

  /** The authored estimate as the server last stored it. */
  readonly estimateDays: number | null

  /** The write, unbound. */
  readonly estimate: SubjectWrite<number | null>
}

/** Everything the markup of an estimate field binds to. */
export interface EstimateState {
  /** The box, so a write can repaint it without re-rendering a controlled input. */
  readonly field: RefObject<HTMLInputElement | null>

  /** What the last write was refused with, `''` for none. */
  readonly problem: string

  /** Commit what was typed, on blur or Enter. */
  readonly commit: (input: HTMLInputElement) => void

  /** Step by one direction, from what the server last stored rather than from the box. */
  readonly step: (direction: number) => void

  /** What the server last stored, which is what Escape puts back in the box. */
  readonly shown: () => string
}

/**
 * The two ways an estimate is written, and the one re-read behind both.
 *
 * Typing commits on blur or Enter, because a half-typed `1` on the way to `12` is not a value anybody
 * meant to send. A button commits at once, because a press is already the whole intention — and it
 * steps from the estimate the **plan** holds rather than from the box, so a press after an abandoned
 * edit cannot send the abandoned number.
 *
 * ### Why it steps from the prop and never from an answer
 *
 * The prop is the plan store's (ADR 0069): a press applies at once, so the very next render carries the
 * stepped value and the next press steps from that. It used to step from the last value an *answer*
 * confirmed, which on a slow connection meant three quick presses all stepped from the same number and
 * the estimate moved one step, not three — three requests, two of them lost. Nothing here reads an answer
 * back any more: a refusal is taken off the plan by the store, which moves the prop, which repaints the box.
 * The box is repainted only while it is not focused, which keeps that from overwriting something typed.
 *
 * A hook rather than a component, because what differs between the field and the items list is the
 * paint and nothing else: one stepper is 34px with a label and a hint, the other is 24px in a row of
 * twenty, and they must not be two implementations of "send an estimate".
 *
 * @param query - The subject, the stored value and the write.
 * @returns The ref, the refusal, and the two commits.
 */
export function useEstimate(query: EstimateQuery): EstimateState {
  const { planId, subjectId, estimateDays, estimate } = query
  const field = useRef<HTMLInputElement>(null)
  const stored = useRef(estimateDays)
  const [problem, setProblem] = useState('')
  useEffect(() => {
    stored.current = estimateDays
    paintUnfocused(field.current, shownDays(estimateDays))
  }, [estimateDays])

  const send = async (days: number | null): Promise<void> => {
    const result = await orNoAnswer(estimate)(planId, subjectId, days)
    setProblem(result.ok ? '' : result.detail)
    paintUnfocused(field.current, shownDays(stored.current))
  }

  const commit = (input: HTMLInputElement): void => {
    const entry = estimateEntry(input.value)
    if (entry.kind === 'refused') {
      setProblem(entry.detail)
      return
    }
    if (entry.days !== stored.current) {
      void send(entry.days)
      return
    }
    setProblem('')
    paintUnfocused(field.current, shownDays(stored.current))
  }

  return {
    commit,
    field,
    problem,
    shown: () => shownDays(stored.current),
    step: (direction) => void send(steppedDays(estimateDays, direction * STEP_DAYS)),
  }
}
