import { SPRINT } from './field-css'
import type { SprintValue } from './sprint-view'

const CARET = String.fromCharCode(0x25be)

/** Props for {@link SprintOpener}. */
export interface SprintOpenerProps {
  /** The number and the word under it (`sprintValue`). */
  readonly value: SprintValue

  /** Whether the list below is open, which is what a reader is told rather than shown. */
  readonly open: boolean

  /** The id of the caption above, which is this button's accessible name. */
  readonly labelledBy: string

  /** Open or shut the list. */
  readonly onToggle: () => void
}

/**
 * The middle of the sprint stepper: the sprint, where it came from, and the way into the list.
 *
 * A button rather than a read-out, because the number itself is the way to the dates: `S3` is a label
 * the whole product uses and nobody can convert in their head. It is named by the caption above it
 * rather than by its own text, so a reader hears "Sprint, S3 pinned" rather than a button called "S3".
 */
export function SprintOpener({ value, open, labelledBy, onToggle }: SprintOpenerProps) {
  return (
    <button
      aria-expanded={open}
      aria-labelledby={labelledBy}
      className={SPRINT.value}
      onClick={onToggle}
      type="button"
    >
      {value.label}
      <span className={SPRINT.mode}>{value.mode}</span>
      <span className={SPRINT.caret}>{CARET}</span>
    </button>
  )
}
