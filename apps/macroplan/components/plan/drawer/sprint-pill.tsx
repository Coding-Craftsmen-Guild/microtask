import { FIELD_CELL, MICRO, SPRINT } from './field-css'

const LABEL = 'Sprint'

const BY_ORDER = 'placed by order'

/** Props for {@link SprintPill}. */
export interface SprintPillProps {
  /** The sprint as the row words it: `S1`, `S1–S2`, or why it is not placed. */
  readonly sprint: string
}

/**
 * An item's sprint, which is a reading and not a field.
 *
 * Only a feature carries a pin (`values.ts`): an item's dates follow its order inside its feature, so
 * the way to move an item to a different sprint is to reorder it or to resize what comes before it.
 * A stepper here would be a control with nothing to write, so this is a flat pill in the strip colour
 * — the shape this panel uses everywhere for "read this, you cannot set it".
 */
export function SprintPill({ sprint }: SprintPillProps) {
  return (
    <div className={FIELD_CELL} data-slot="sprint-pill">
      <span className={MICRO}>{LABEL}</span>
      <p className={SPRINT.pill}>
        {sprint}
        <span className={SPRINT.pillNote}>{BY_ORDER}</span>
      </p>
    </div>
  )
}
