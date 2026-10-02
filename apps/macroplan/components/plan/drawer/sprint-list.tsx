import { SPRINT } from './field-css'
import { SPRINT_WORDS, type SprintChoice } from './sprint-view'

/** Props for {@link SprintList}. */
export interface SprintListProps {
  /** Every row to draw: Auto, then the sprints (`sprintChoices`). */
  readonly rows: readonly SprintChoice[]

  /** What a chosen row writes: the pin, or `null` to hand the sprint back to the schedule. */
  readonly onPick: (sprint: number | null) => void
}

/**
 * The sprints, with the days each one covers.
 *
 * A row that is earlier than the schedule's own answer is drawn and **labelled** rather than left out:
 * a pin is a floor, so picking it changes nothing, and a list that silently dropped those rows would
 * be a list whose numbering has holes in it. It stays clickable, because writing a pin the schedule
 * already satisfies is harmless and the label is what explains the result.
 */
export function SprintList({ rows, onPick }: SprintListProps) {
  return (
    <div className={SPRINT.list} data-slot="sprint-list">
      {rows.map((row) => (
        <button
          className={row.picked ? SPRINT.rowOn : SPRINT.row}
          data-earlier={row.earlier ? '' : undefined}
          key={row.label}
          onClick={() => onPick(row.sprint)}
          type="button"
        >
          {row.label}
          <span className={row.earlier ? SPRINT.earlier : SPRINT.note}>
            {row.earlier ? SPRINT_WORDS.earlier : row.when}
          </span>
          {row.picked ? <span className={SPRINT.tick}>{SPRINT_WORDS.tick}</span> : null}
        </button>
      ))}
    </div>
  )
}
