'use client'

import type { FeaturePlacement, ItemPlacement } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { PROBLEM, type SubjectWrite } from './field'
import type { SubjectKind } from './values'

const STEP =
  'rounded-md px-2 py-1 text-left text-[13px] ring-1 ring-foreground/15 hover:bg-foreground/5 disabled:opacity-40'

/** Props for {@link PlaceControl}. */
export interface PlaceControlProps {
  /** The plan this write is addressed at. */
  readonly planId: string

  /** The feature or item being moved. */
  readonly subjectId: string

  /** Which of the two it is, which is what chooses the write and the payload's parent key. */
  readonly kind: SubjectKind

  /** The parent to send: the subject's own rail or feature, or another one. */
  readonly parentId: string

  /** The place among the siblings left once the subject is lifted out (`./placement.ts`). */
  readonly position: number

  /** This control's whole accessible name — `Move up`, or `Move to Platform`. */
  readonly label: string

  /** Whether there is nowhere to go, which is how an end of the list is drawn. */
  readonly disabled: boolean

  /** Moves one feature along its rail or onto another. */
  readonly placeFeature: SubjectWrite<FeaturePlacement>

  /** Moves one item inside its feature or under another. */
  readonly placeItem: SubjectWrite<ItemPlacement>
}

/**
 * One place a subject can be sent, as a button that sends it.
 *
 * ### A control per step, because the steps are a list and a list cannot cross
 *
 * `./place-controls.tsx` stays on the server, works out every step there is, and mounts one of these per
 * step with that step's own primitives — the shape `./dependency-toggle.tsx` and `./cycle-check.ts`
 * established, and for the same reason: a client component may be handed primitives, an unbound function or
 * `null` and nothing else (`../module-boundaries.test.tsx`). So this control can see one destination and
 * cannot enumerate the others, and no list of rails, features or names is ever serialised.
 *
 * ### Two actions cross, and the `kind` picks between them here
 *
 * `FeaturePlacementPayload` names an `epicId` and `ItemPlacementPayload` a `featureId`, so there is no one
 * `SubjectWrite<Value>` both fit and no closure that could unify them — a closure cannot cross this boundary
 * at all (ADR 0040). `./placement.ts` argues that in full; what lands here is the two action references and
 * the one primitive that says which is right, and the payload is built beside the call.
 *
 * ### A button, disabled at the ends, and nothing controlled
 *
 * `disabled` rather than absent, because a control that vanishes at the end of a list moves the next control
 * under a keyboard user's fingers — Microtask's `task-menu.tsx` draws the same two entries the same way. The
 * button holds no state of its own and reads nothing back: a placement answers the whole recomputed plan and
 * `adminWrite` calls `refresh()`, so the drawer and the timeline are both re-rendered from what the server
 * stored, and there is no local copy of an order here to keep in step with it. That is the difference from
 * every field in this drawer: a field re-reads its own value out of the write's answer because it holds text
 * a user typed; a step holds nothing.
 *
 * The refusal is the drawer's own idiom — one `role="alert"` line under the control that was refused, in this
 * app's words rather than the API's (`lib/refusal.ts`). It is not a gate: the write is sent in every case, and
 * whatever comes back — a 403 for a seat re-roled since the render, a 404 for a subject someone else deleted —
 * is said here.
 */
export function PlaceControl(step: PlaceControlProps) {
  const [problem, setProblem] = useState('')
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
        className={STEP}
        disabled={step.disabled}
        onClick={() => void commit()}
        type="button"
      >
        {step.label}
      </button>
      {problem === '' ? null : (
        <p className={PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </>
  )
}
