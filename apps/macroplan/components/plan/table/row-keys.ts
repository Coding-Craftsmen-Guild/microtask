import { effectiveEstimate, sprintOf } from '@repo/schedule'
import type { ScheduleFeature, ScheduleItem } from '@repo/schedule'

/**
 * The values a block is ordered by, one per column that has a single answer for a whole feature.
 *
 * On a **feature** row and `null` on an item's, because a sort moves blocks: a feature and its items
 * travel together, so the feature's own values are the only ones there is one of. `columns.ts` carries
 * why `Item` and `Progress` are not here at all.
 *
 * Numbers where the column is a number, and `-1` for "there is no answer" rather than `null`, because
 * every one of these lands as an attribute and an attribute is a string either way — so the sentinel is
 * chosen here, once, instead of each reader deciding what an empty attribute meant. `compareSort` is
 * what knows that `-1` sinks to the bottom whichever way the column runs.
 */
export interface TableSort {
  readonly epic: string

  readonly feature: string

  /** The group's name, or `''` for a feature in none. */
  readonly group: string

  /** Effective days, or `-1` where nothing was sized. */
  readonly estimate: number

  /** The sprint the work opens in, zero-based, or `-1` where it was not placed. */
  readonly sprint: number

  /** How many dependencies the feature states, honoured or not. */
  readonly blocked: number
}

/** What {@link sortOf} and {@link searchOf} need from the plan, and nothing else. */
export interface KeySource {
  readonly epics: ReadonlyMap<string, string>
  readonly features: ReadonlyMap<string, string>
  readonly itemNames: ReadonlyMap<string, string>
  readonly labels: ReadonlyMap<string, string>
  readonly spans: ReadonlyMap<string, { readonly startDay: number }>
  readonly items: ReadonlyMap<string, readonly ScheduleItem[]>
  readonly plan: { readonly startDate: string; readonly sprintLengthDays: number; readonly timezone: string }
}

/** Where no answer sorts: last, whichever way the column runs. `columns.ts`'s `compareSort` is what knows. */
export const NO_ANSWER = -1

/**
 * Everything a row can be found by, joined and lower-cased.
 *
 * Pre-lowered by the server because the alternative is lower-casing two thousand strings on every
 * keystroke — the same trade `sidebar/sidebar-rows.ts` makes with `data-search`, and the reason both
 * match with `includes` rather than a regular expression. A `null` part is dropped rather than joined as
 * an empty string, so a feature in no group does not carry a double space somebody could search for.
 */
export const searchOf = (parts: readonly (string | null)[]): string =>
  parts.filter((part) => part !== null).join(' ').toLowerCase()

/** The sprint a span opens in, or {@link NO_ANSWER} where there is no span. */
export const sprintKey = (
  id: string,
  spans: KeySource['spans'],
  plan: KeySource['plan'],
): number => {
  const span = spans.get(id)
  return span === undefined ? NO_ANSWER : sprintOf(span.startDay, plan)
}

/**
 * What a block is ordered by, read off the feature that heads it.
 *
 * The **same numbers the cells were worded from**, rather than the words: a sort would otherwise have to
 * parse `planned 5d · broken down to 6d · +1d` back into a number that was already in hand, and the two
 * could then disagree about what a row is worth. `rows.test.ts` pins that pairing on the one fixture
 * where a feature's own estimate and its breakdown differ.
 */
export const sortOf = (
  feature: ScheduleFeature,
  source: KeySource,
  cells: { readonly epic: string; readonly feature: string; readonly group: string | null },
): TableSort => ({
  epic: cells.epic,
  feature: cells.feature,
  group: cells.group ?? '',
  estimate: effectiveEstimate(feature, source.items.get(feature.id) ?? []) ?? NO_ANSWER,
  sprint: sprintKey(feature.id, source.spans, source.plan),
  blocked: feature.dependsOn.length,
})
