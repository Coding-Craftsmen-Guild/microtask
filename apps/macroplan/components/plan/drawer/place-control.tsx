'use client'

import type { FeaturePlacement, ItemPlacement } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { FIELD_PROBLEM, PICKER } from './field-css'
import type { SubjectWrite } from './field'
import { ORDER } from './list-css'
import type { SubjectKind } from './values'

const TONES = { row: PICKER.row, step: ORDER.step } as const

/** Props for {@link PlaceControl}. */
export interface PlaceControlProps {
  /** The plan the placement is written to. */
  readonly planId: string

  /** The subject being moved. */
  readonly subjectId: string

  /** Which kind it is, since the two placements name different parents. */
  readonly kind: SubjectKind

  /** The parent it lands under: an epic for a feature, a feature for an item. */
  readonly parentId: string

  /** Where among that parent's children it lands, as an index. */
  readonly position: number

  /** What the button shows, which for an order step is a glyph. */
  readonly label: string

  /** What it is called, where that is not what it shows. */
  readonly name?: string

  /** The hue of the parent it names, drawn as a swatch; `''` for a control with nothing to colour. */
  readonly colour?: string

  /** Which of the two shapes: a row of a picker, or one of the two order steps. */
  readonly tone: 'row' | 'step'

  /** Whether this move is already where the subject is, in which case the button says so. */
  readonly disabled: boolean

  /** The feature write, unbound. */
  readonly placeFeature: SubjectWrite<FeaturePlacement>

  /** The item write, unbound. */
  readonly placeItem: SubjectWrite<ItemPlacement>
}

/**
 * One placement, as one button: a row of a picker, or a step in an order.
 *
 * ### One control for two very different-looking things
 *
 * "Move this item one place later" and "move this feature to the Billing rail" are the same write with
 * different arguments — a parent and a position — so they are the same component with different paint.
 * That is what keeps the two surfaces honest: the picker cannot grow a second way of placing work, and
 * the refusal a seat gets is worded once.
 *
 * ### Why it is the island rather than the picker around it
 *
 * The picker is a `details` full of server-rendered rows, and this is the only part of it that has to
 * be in the browser: a button that calls an action and says what came back. Nothing else about a list
 * of rails needs JavaScript, and a client component handed the rails would be handed an array of
 * objects, which `../module-boundaries.test.tsx` refuses for the reason ADR 0033 gives.
 */
export function PlaceControl(step: PlaceControlProps) {
  const [problem, setProblem] = useState('')
  const colour = step.colour ?? ''
  const commit = async () => {
    const answer =
      step.kind === 'feature'
        ? await orNoAnswer(step.placeFeature)(step.planId, step.subjectId, {
            epicId: step.parentId,
            position: step.position,
          })
        : await orNoAnswer(step.placeItem)(step.planId, step.subjectId, {
            featureId: step.parentId,
            position: step.position,
          })
    setProblem(answer.ok ? '' : answer.detail)
  }
  return (
    <>
      <button
        aria-label={step.name ?? undefined}
        className={TONES[step.tone]}
        data-slot="place-control"
        disabled={step.disabled}
        onClick={() => void commit()}
        type="button"
      >
        {colour === '' ? null : (
          <span className={PICKER.swatch} style={{ backgroundColor: colour }} />
        )}
        <span className={PICKER.name}>{step.label}</span>
      </button>
      {problem === '' ? null : (
        <p className={FIELD_PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </>
  )
}
