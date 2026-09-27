'use client'

import type { FeaturePlacement, ItemPlacement } from '@repo/api-client'
import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { FIELD, PROBLEM, type SubjectWrite } from './field'
import { splitGroups } from './group-options'
import type { SubjectKind } from './values'

const HERE = 'mp-move-here'

const ROW = 'grid gap-1'

/** The words the target picker uses, by what is being moved. */
export const MOVE_WORDS: Readonly<Record<SubjectKind, { readonly here: string; readonly label: string }>> = {
  feature: { here: 'On this rail', label: 'Move to another rail' },
  item: { here: 'Under this feature', label: 'Move to another feature' },
}

/** Props for {@link MoveTargetField}. */
export interface MoveTargetFieldProps {
  readonly planId: string

  readonly subjectId: string

  readonly kind: SubjectKind

  /** Where in the new parent it lands, which is the position it holds today. */
  readonly position: number

  /**
   * Everywhere else it could go, as one joined string. Nothing renders when there is nowhere.
   *
   * A string and not an array of records, because everything handed to a client component is
   * serialised into the Flight payload and lands in the HTML — so `module-boundaries.test.tsx`
   * admits only primitives here. `joinGroups`/`splitGroups` set the pattern for the group picker and
   * this reuses their encoding rather than inventing a second one.
   */
  readonly targets: string

  readonly placeFeature: SubjectWrite<FeaturePlacement>

  readonly placeItem: SubjectWrite<ItemPlacement>
}

/**
 * Where a feature or an item moves to, as one select.
 *
 * ### Why it is not a button each
 *
 * It was. `stepsFor` returned one step per possible destination and the drawer rendered a full-width
 * button for every one, so a plan with eleven other features put eleven "Move to …" buttons down the
 * item drawer, under two more for up and down. That is the same failure as the conflict wall a
 * screen away: a list of every option spelled out in full, in a column, where one control would do.
 *
 * The resting option names where the subject is now, which thirteen buttons could not: they said only
 * where it could go.
 *
 * Up and down stay buttons, in {@link PlaceControls}: they are one click each, they are the common
 * case, and putting them in the same select would mean choosing "down" and then finding "down"
 * still selected.
 */
export function MoveTargetField(props: MoveTargetFieldProps) {
  const { planId, subjectId, kind, position, targets, placeFeature, placeItem } = props
  const choices = splitGroups(targets)
  const [problem, setProblem] = useState('')
  const fieldId = `plan-drawer-move-${kind}`
  const send = async (value: string): Promise<void> => {
    if (value === HERE) return
    const answer =
      kind === 'feature'
        ? await orNoAnswer(placeFeature)(planId, subjectId, { epicId: value, position })
        : await orNoAnswer(placeItem)(planId, subjectId, { featureId: value, position })
    setProblem(answer.ok ? '' : answer.detail)
  }
  if (choices.length === 0) return null
  return (
    <div className={ROW}>
      <label className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" htmlFor={fieldId}>
        {MOVE_WORDS[kind].label}
      </label>
      <select
        className={FIELD}
        id={fieldId}
        onChange={(event) => void send(event.currentTarget.value)}
        value={HERE}
      >
        <option value={HERE}>{MOVE_WORDS[kind].here}</option>
        {choices.map((target) => (
          <option key={target.id} value={target.id}>
            {target.name}
          </option>
        ))}
      </select>
      {problem === '' ? null : (
        <p className={PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </div>
  )
}
