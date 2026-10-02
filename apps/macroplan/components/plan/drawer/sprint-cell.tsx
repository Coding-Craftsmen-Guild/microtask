import type { PanelParts } from './panel-parts'
import { PinField } from './pin-field'
import { SprintPill } from './sprint-pill'

/** Props for {@link SprintCell}. */
export interface SprintCellProps {
  /** Everything the panel was handed. */
  readonly parts: PanelParts
}

/**
 * The sprint field, which is a stepper on a feature and a reading on an item.
 *
 * One cell of the fields row and two different controls, because the two kinds answer the question
 * differently: a feature may be pinned, and an item's dates follow its order inside its feature. A
 * stepper on an item would be a control with nothing to write, and a flat pill on a feature would hide
 * the one schedule constraint this panel can set (`./sprint-pill.tsx`, `./pin-field.tsx`).
 */
export function SprintCell({ parts }: SprintCellProps) {
  const { row, values, controls, actions, planId } = parts
  if (row.kind === 'item') return <SprintPill sprint={row.sprint} />
  if (!controls.pinFeature) return null
  return (
    <PinField
      featureId={row.id}
      pin={actions.pinFeature}
      pinSprint={values.pinSprint}
      planId={planId}
      scheduledSprint={values.panel.scheduledSprint}
      sprintLengthDays={values.plan.calendar.sprintLengthDays}
      sprintTotal={values.panel.sprintTotal}
      startDate={values.plan.calendar.startDate}
      timezone={values.plan.calendar.timezone}
    />
  )
}
