'use client'

import { orNoAnswer } from '@repo/app-session/no-answer'
import { useState } from 'react'
import { FIELD, type SubjectWrite } from './field'
import { FieldShell } from './field-shell'
import { NO_GROUP, splitGroups } from './group-options'

const FIELD_ID = 'plan-drawer-group'

/** Props for {@link GroupField}. */
export interface GroupFieldProps {
  /** The plan this write is addressed at. */
  readonly planId: string

  /** The feature whose group this sets. There is no item form: `PlanItem` carries no group. */
  readonly featureId: string

  /** The group as stored, or `null` for a feature in none — which is what the box opens on. */
  readonly labelId: string | null

  /** Every group of the plan, joined — {@link splitGroups} is what undoes it. */
  readonly options: string

  /** Sends the new group — `null` takes the feature out of one — and answers the plan. */
  readonly setLabel: SubjectWrite<string | null>
}

/** The line under the box, and what the option that clears the group is called. */
export const GROUP_FIELD_WORDS = {
  none: 'In no group',
  hint: 'A group spans rails: choosing its chip above lights every feature in it and dims the rest. It changes no date.',
  empty: 'This plan has no groups yet. Add one from the groups panel beside the plan’s name.',
} as const

/**
 * Which group this feature is in, as a `<select>` over the plan's own groups.
 *
 * ### A separate control because it is a separate authority
 *
 * `feature:label` is granted to `manage`, like `feature:pin` beside it, and `PUT …/features/{id}/label`
 * is its own route rather than a key on the feature `PATCH` — so this sends one field and is drawn on
 * `controls.labelFeature` alone. The API is still the gate, asked again at the instant of the change.
 *
 * ### Why a group is set here and chosen there
 *
 * The chips beside the plan's name are for **reading** a plan: they select a group so an admin can see
 * what is in it across every rail, and they write nothing. This is the write, and it is in the drawer
 * because the drawer is where one feature's own fields are edited. Putting the assignment on the chips
 * would have made one control mean "show me this" and "put this in that" depending on what was open.
 *
 * ### It commits on change and shows what the server stored
 *
 * A `<select>` has no half-typed state, so there is nothing to commit on blur and no Escape to revert:
 * one change is one request. What is on screen afterwards is the answered plan's own value, re-rendered
 * from the server, exactly as every other field in this drawer reads itself back rather than assuming
 * what it sent.
 *
 * A plan with no groups draws the box anyway, disabled, and says where groups are made. Hiding the field
 * would leave an admin who has never made one with nothing on screen to explain why.
 */
export function GroupField({ planId, featureId, labelId, options, setLabel }: GroupFieldProps) {
  const [problem, setProblem] = useState('')
  const choices = splitGroups(options)

  const send = async (value: string): Promise<void> => {
    const result = await orNoAnswer(setLabel)(planId, featureId, value === NO_GROUP ? null : value)
    setProblem(result.ok ? '' : result.detail)
  }

  return (
    <FieldShell
      fieldId={FIELD_ID}
      hint={choices.length === 0 ? GROUP_FIELD_WORDS.empty : GROUP_FIELD_WORDS.hint}
      label="Group"
      problem={problem}
    >
      {(wiring) => (
        <select
          {...wiring}
          className={FIELD}
          disabled={choices.length === 0}
          onChange={(event) => void send(event.currentTarget.value)}
          value={labelId ?? NO_GROUP}
        >
          <option value={NO_GROUP}>{GROUP_FIELD_WORDS.none}</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  )
}
