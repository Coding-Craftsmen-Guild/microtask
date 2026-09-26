import type { PlanScreenModel } from '../plan-screen-model'

/** One group as a surface reports it: what it is called, its colour, and how much is in it. */
export interface LabelRow {
  /** The group. */
  readonly id: string

  /** What it is called. */
  readonly name: string

  /** Its `#rrggbb`, which is drawn as a swatch and never as a bar's fill (spec §5). */
  readonly colour: string

  /**
   * How many features are in it, across every rail.
   *
   * The number is the whole point of a group rather than decoration: "phase 1" holding four features on
   * three rails is the fact somebody made the group to see, and a group holding **none** is the state a
   * reader most needs told — an empty group dims the entire plan when it is chosen, and without a count
   * that reads as a bug rather than as an empty phase.
   */
  readonly features: number
}

const ULID = /^[0-9A-Z]{26}$/

/**
 * Whether one id is safe to interpolate into a stylesheet.
 *
 * The pattern is `[0-9A-Z]{26}` — a ULID, spelled without a shorthand class so no escape sequence
 * appears in this file at all. Crockford base32 excludes four of those letters and that is no business of
 * this check: what it is for is refusing anything that could not be an id, where the narrower check
 * belongs to `EntityId` in `@repo/contracts`, which every one of these ids was already decoded against.
 *
 * **The reason this exists at all**: {@link groupCss} builds a CSS rule naming each group's id, and a
 * value reaching a stylesheet is a value that can end the rule it is in and start another. Every id here
 * has already been through `PlanView`'s `EntityId`, so nothing can currently fail this — which is
 * precisely why it is checked here rather than trusted: the day a group is read from somewhere that is
 * not a validated response, the failure should be a group that does not dim rather than a page whose
 * styles were written by its data.
 */
export const isStyleSafeId = (id: string): boolean => ULID.test(id)

/**
 * Every group of one plan, in the order the plan carries them, each with what it holds.
 *
 * Ordered as stored and not sorted by name: labels are created in the order phases happen, their ids are
 * ULIDs, and a plan's `labels` array is already in creation order — so "Phase 1, Phase 2, Phase 3" reads
 * in that order without anybody having numbered them for a sort. Sorting by name would put "Phase 10"
 * second.
 *
 * The count is one pass over `features` per group rather than a map built first, because a plan holds at
 * most `LIMITS.labelsPerPlan` groups and `LIMITS.featuresPerPlan` features — twenty times two hundred is
 * four thousand comparisons on a screen that already derives a schedule.
 */
export function labelRows(plan: PlanScreenModel): readonly LabelRow[] {
  return plan.labels.map((label) => ({
    id: label.id,
    name: label.name,
    colour: label.colour,
    features: plan.features.filter((feature) => feature.labelId === label.id).length,
  }))
}
