import type { Breakdown, ScheduleFeature, ScheduleItem } from './structure.js'

function estimatesOf(items: readonly ScheduleItem[]): readonly number[] {
  return items.flatMap((item) => (item.estimateDays === null ? [] : [item.estimateDays]))
}

function total(days: readonly number[]): number {
  return days.reduce((running, day) => running + day, 0)
}

/**
 * What a feature is actually worth, in working days.
 *
 * The sum of its **estimated** items when it has at least one, and its own authored estimate
 * otherwise. `null` means it cannot be scheduled at all, and is what sends a feature into
 * `ScheduleResult.unscheduled` as `'no-estimate'` rather than onto the axis at a guessed width.
 *
 * The gate is *at least one estimated item*, not *has items*. Summing over zero estimated
 * children would answer 0, which turns a 40-day feature into a milestone the moment someone
 * names its first item and has not yet sized it — the estimate would evaporate mid-typing.
 * So an unestimated breakdown is no breakdown, and the authored value still stands.
 *
 * Nothing here treats 0 as absent. An `estimateDays` of 0 is a milestone: a real estimate that
 * means no time, and the only thing that distinguishes it from `null` is the `=== null` test.
 * Three items estimated at 0 therefore answer 0 and override an authored 40, exactly as three
 * items estimated at 1 would answer 3; a truthiness check anywhere in this file would instead
 * silently resurrect the authored value and draw a bar where the plan says there is none.
 *
 * `items` is the feature's own items, already filtered by the caller; this never reads
 * `item.featureId`, and never writes to either argument.
 */
export function effectiveEstimate(
  feature: ScheduleFeature,
  items: readonly ScheduleItem[],
): number | null {
  const estimates = estimatesOf(items)
  return estimates.length === 0 ? feature.estimateDays : total(estimates)
}

/**
 * The authored estimate beside what the breakdown came to, or `null` when there is no pair.
 *
 * Present only when a feature carries an authored estimate **and** at least one estimated item:
 * a feature with an authored estimate and no breakdown has nothing to compare, and so does a
 * breakdown with nothing authored beside it. Both halves are compared against `null` and not
 * for truth, so an authored 0 or a breakdown that comes to 0 is still a pair worth reporting.
 *
 * `delta` is `brokenDown - planned`, so it reads as what the breakdown adds to the plan: positive
 * when the items overrun what was authored, negative when they fall short. A negative delta is a
 * real and reportable state — a part-sized breakdown under a whole-feature estimate — not an
 * error, and this never edits `planned` to match.
 */
export function breakdown(
  feature: ScheduleFeature,
  items: readonly ScheduleItem[],
): Breakdown | null {
  const estimates = estimatesOf(items)
  if (feature.estimateDays === null || estimates.length === 0) return null
  const brokenDown = total(estimates)
  return { planned: feature.estimateDays, brokenDown, delta: brokenDown - feature.estimateDays }
}
