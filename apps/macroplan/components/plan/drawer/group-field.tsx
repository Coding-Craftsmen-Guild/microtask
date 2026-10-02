'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { CHIP, FIELD_CELL, FIELD_PROBLEM, MICRO } from './field-css'
import type { SubjectWrite } from './field'
import { NO_GROUP, splitPicks } from './pick-list'

const FIELD_ID = 'plan-drawer-group'

/** Props for {@link GroupField}. */
export interface GroupFieldProps {
  /** The plan the write is addressed at. */
  readonly planId: string

  /** The feature being grouped. */
  readonly featureId: string

  /** The group it is in now, or `null` for none. */
  readonly labelId: string | null

  /** Every group of the plan, joined — {@link splitPicks} is what undoes it. */
  readonly options: string

  /** The write, unbound: a group id, or `null` to take the feature out of its group. */
  readonly setLabel: SubjectWrite<string | null>
}

/** The caption, the chip that is not a group, and what a plan with no groups is told. */
export const GROUP_FIELD_WORDS = {
  label: 'Group',
  none: 'No group',
  empty: 'No groups yet. Add one from the Groups menu above the board.',
} as const

/**
 * The groups, as chips in their own colours.
 *
 * ### Why chips and not a select
 *
 * A group is the one field on this panel whose **value is a colour**: the canvas paints a grouped
 * feature in its group's hue, and a reader scanning the board is navigating by those hues. A `select`
 * can show a name and nothing else, so it asked a reader to remember which name went with the colour
 * they were looking at. Chips carry the dot, so the field and the board agree on sight.
 *
 * They are also the whole set at a glance, which matters because this field is how a plan's groups are
 * *used*: four chips are four one-click answers, where a select is a click, a scan and a click.
 *
 * ### Why they are radios
 *
 * A feature is in one group or in none, and that is exactly what a radio group means — one name for
 * the set, arrow keys between the options, and a reader on a screen reader told "Group, Phase 1,
 * 2 of 4" rather than hearing four unrelated buttons. The inputs are `sr-only` and each label carries
 * the paint, because the dot and the hue border cannot be drawn on a native radio. `No group` is a
 * real option in the set and not an empty one, since taking a feature out of its group is a write
 * somebody means to make.
 */
export function GroupField({ planId, featureId, labelId, options, setLabel }: GroupFieldProps) {
  const [problem, setProblem] = useState('')
  const choices = [{ colour: '', id: NO_GROUP, name: GROUP_FIELD_WORDS.none }, ...splitPicks(options)]

  const send = async (value: string): Promise<void> => {
    const result = await orNoAnswer(setLabel)(planId, featureId, value === NO_GROUP ? null : value)
    setProblem(result.ok ? '' : result.detail)
  }

  return (
    <fieldset className={FIELD_CELL} data-slot="group-field">
      <legend className={MICRO}>{GROUP_FIELD_WORDS.label}</legend>
      {choices.length === 1 ? (
        <p className={FIELD_PROBLEM}>{GROUP_FIELD_WORDS.empty}</p>
      ) : (
        <div className={CHIP.row}>
          {choices.map((choice) => {
            const on = (labelId ?? NO_GROUP) === choice.id
            return (
              <label
                className={on ? CHIP.on : CHIP.off}
                data-slot="group-chip"
                key={choice.id}
                style={on && choice.colour !== '' ? { borderColor: choice.colour } : undefined}
              >
                <input
                  checked={on}
                  className="sr-only"
                  name={`${FIELD_ID}-${featureId}`}
                  onChange={() => void send(choice.id)}
                  type="radio"
                  value={choice.id}
                />
                <span
                  className={choice.colour === '' ? CHIP.hollow : CHIP.dot}
                  style={choice.colour === '' ? undefined : { backgroundColor: choice.colour }}
                />
                {choice.name}
              </label>
            )
          })}
        </div>
      )}
      {problem === '' ? null : (
        <p className={FIELD_PROBLEM} role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  )
}
