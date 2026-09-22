/** What turns a working-day offset into a calendar position. */
export interface PlanCalendar {
  readonly startDate: string
  readonly sprintLengthDays: number
  readonly timezone: string
}

/** A rail in the timeline, ordered against its sibling rails. */
export interface ScheduleEpic {
  readonly id: string
  readonly railOrder: number
}

/** A feature placed on a rail: its own estimate, an optional pin, and what it waits on. */
export interface ScheduleFeature {
  readonly id: string
  readonly epicId: string
  readonly position: number

  /**
   * The feature's own authored days. `null` means no estimate was given — with no items to
   * fall back on, that is exactly why the forward pass cannot place it: it comes back in
   * `ScheduleResult.unscheduled` as `'no-estimate'` rather than a guessed duration.
   */
  readonly estimateDays: number | null

  /**
   * The sprint this feature may not start before, or `null` for no constraint. A pin is one
   * more lower bound the forward pass folds into its `max()` — it can only delay a feature
   * past what rail order and dependencies would give it, never move it earlier.
   */
  readonly pinSprint: number | null

  readonly dependsOn: readonly string[]
}

/** A unit of work under a feature, contributing to that feature's breakdown. */
export interface ScheduleItem {
  readonly id: string
  readonly featureId: string
  readonly position: number
  readonly estimateDays: number | null
}

/** Everything the forward pass reads. A `PlanManifest` satisfies it structurally. */
export interface PlanStructure extends PlanCalendar {
  readonly epics: readonly ScheduleEpic[]
  readonly features: readonly ScheduleFeature[]
  readonly items: readonly ScheduleItem[]
}

/** Working-day offsets from the plan's first working day. `endDay` is **exclusive**. */
export interface Span {
  readonly startDay: number

  /** Exclusive: the first working-day offset **not** included in this span. */
  readonly endDay: number
}

/** Feature ids that depend on each other, in ascending id order. */
export interface Cycle {
  readonly featureIds: readonly string[]
}

/**
 * Why a feature or item was left off the axis. `'no-estimate'` covers it having (and, for a
 * feature, everything under it having) no duration to place. `'in-cycle'` applies only to a
 * feature caught in a `dependsOn` cycle — and drags every one of its items down with it,
 * whether or not those items have estimates of their own.
 */
export type UnscheduledReason = 'no-estimate' | 'in-cycle'

/** A feature the forward pass left off the axis, and why. */
export interface Unscheduled {
  readonly id: string
  readonly reason: UnscheduledReason
}

/** The result of a forward pass over a `PlanStructure`. */
export interface ScheduleResult {
  /**
   * A span for every feature or item the pass could place, keyed by its own id — feature ids
   * and item ids share this one map.
   */
  readonly days: ReadonlyMap<string, Span>

  readonly cycles: readonly Cycle[]
  readonly unscheduled: readonly Unscheduled[]
}

/** An authored estimate beside what its children add up to. */
export interface Breakdown {
  readonly planned: number
  readonly brokenDown: number
  readonly delta: number
}
