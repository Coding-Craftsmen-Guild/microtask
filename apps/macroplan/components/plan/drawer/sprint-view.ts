import { rangeOfSprint, type PlanCalendar } from '@repo/schedule'

const DASH = String.fromCharCode(0x2013)

const NOT_PLACED = String.fromCharCode(0x2014)

/** What the value in the middle of the sprint stepper reads, and what it says underneath. */
export interface SprintValue {
  /** The sprint, as the table and the board number them: `S3`, or an em dash for work nothing placed. */
  readonly label: string

  /** Where that number came from: somebody's pin, the schedule, or nowhere yet. */
  readonly mode: string
}

/** One row of the sprint list: a sprint to pin to, or the row that clears the pin. */
export interface SprintChoice {
  /** The pin this row writes, or `null` for the row that hands the sprint back to the schedule. */
  readonly sprint: number | null

  /** How the row names it. */
  readonly label: string

  /** The days it covers, or what Auto means. */
  readonly when: string

  /** Whether it is earlier than the schedule's own answer, which a pin cannot move a feature to. */
  readonly earlier: boolean

  /** Whether it is the pin the feature currently holds. */
  readonly picked: boolean
}

/** Where a feature's sprint stands: what is pinned, and what the schedule made of it. */
export interface SprintStanding {
  /** The 0-based pin, or `null` for a feature the schedule places freely. */
  readonly pinSprint: number | null

  /** The 0-based sprint the schedule put it in, or `null` for work it could not place. */
  readonly scheduledSprint: number | null
}

/**
 * Every word the sprint field says, in one place because three files say them.
 *
 * The stepper writes the value, the list writes the rows and the pill reads one of them, so a word
 * spelled twice is a field that can disagree with its own list about what `auto` means.
 */
export const SPRINT_WORDS = {
  auto: 'Auto',
  autoWhen: 'placed by the schedule',
  pinned: 'pinned',
  loose: 'auto',
  nowhere: 'not placed',
  earlier: 'earlier than scheduled',
  less: 'One sprint earlier, then no pin at all',
  more: 'Pin one sprint later',
  open: 'Pick a sprint to pin to',
  tick: String.fromCharCode(0x2713),
} as const

const named = (sprint: number): string => `S${String(sprint + 1)}`

/**
 * The number the stepper shows, and the word under it.
 *
 * A pin wins over the schedule because a pin is what the field writes, and the two agree far more
 * often than not: a pin is a floor, so the schedule's answer *is* the pin whenever nothing else
 * delays the feature. Showing the pin regardless is what makes `-` legible — the reader is stepping
 * the number they can see.
 *
 * @param standing - What is pinned and what the schedule answered.
 * @returns The label and the one word that says where it came from.
 */
export function sprintValue(standing: SprintStanding): SprintValue {
  const { pinSprint, scheduledSprint } = standing
  if (pinSprint !== null) return { label: named(pinSprint), mode: SPRINT_WORDS.pinned }
  if (scheduledSprint !== null) return { label: named(scheduledSprint), mode: SPRINT_WORDS.loose }
  return { label: NOT_PLACED, mode: SPRINT_WORDS.nowhere }
}

/**
 * Where one press of the sprint stepper lands.
 *
 * Down walks the pin towards the schedule and then **clears it**, which is the only sensible floor: a
 * pin below the scheduled sprint changes nothing at all — the forward pass folds a pin into a `max()`
 * — so a stepper that kept going would be a control whose presses stopped having an effect without
 * saying so. Clearing is the real end of that road, and it is one press further.
 *
 * Up pins from whatever is on screen, so the first press on an unpinned feature pins it one sprint
 * later than the schedule put it. `total` is the ceiling the list offers, which is itself capped by
 * the contract's furthest pinnable sprint.
 *
 * @param direction - `-1` down, `1` up.
 * @param standing - What is pinned and what the schedule answered.
 * @param total - How many sprints the list offers.
 * @returns The pin to write, `null` to clear it, or `undefined` for a press that changes nothing.
 */
export function stepPin(
  direction: number,
  standing: SprintStanding,
  total: number,
): number | null | undefined {
  const { pinSprint, scheduledSprint } = standing
  const floor = scheduledSprint ?? 0
  if (direction < 0) {
    if (pinSprint === null) return undefined
    return pinSprint <= floor ? null : pinSprint - 1
  }
  const next = (pinSprint ?? floor) + 1
  return next >= total ? undefined : next
}

/**
 * Every row of the sprint list: Auto, then the sprints with the days they cover.
 *
 * The dates are the point of the list. `S3` is a label the whole product uses and nobody can convert
 * in their head, so a reader pinning work to a sprint is choosing dates whether they are shown or
 * not. A row earlier than the schedule's answer is **offered and marked** rather than hidden, because
 * the question being asked is "can I start it in S1", and the honest answer is "a pin cannot move it
 * earlier" rather than an S1 that is missing from the list.
 *
 * @param standing - What is pinned and what the schedule answered.
 * @param total - How many sprints to offer.
 * @param calendar - The plan's calendar, which turns a sprint into its first and last day.
 * @returns The Auto row, then one row per sprint, in order.
 */
export function sprintChoices(
  standing: SprintStanding,
  total: number,
  calendar: PlanCalendar,
): readonly SprintChoice[] {
  const floor = standing.scheduledSprint
  const auto: SprintChoice = {
    earlier: false,
    label: SPRINT_WORDS.auto,
    picked: standing.pinSprint === null,
    sprint: null,
    when:
      floor === null
        ? SPRINT_WORDS.autoWhen
        : `${SPRINT_WORDS.autoWhen} (${named(floor)})`,
  }
  const rows = [...Array(Math.max(total, 0)).keys()].map((sprint) => {
    const range = rangeOfSprint(sprint, calendar)
    return {
      earlier: floor !== null && sprint < floor,
      label: named(sprint),
      picked: standing.pinSprint === sprint,
      sprint,
      when: `${range.from} ${DASH} ${range.to}`,
    }
  })
  return [auto, ...rows]
}
