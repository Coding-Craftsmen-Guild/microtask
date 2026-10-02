import { dayToDate, sprintOf, type PlanCalendar, type Span } from '@repo/schedule'
import type { PlanScreenModel } from '../plan-screen-model'
import { pinCeiling } from './field'
import type { ChildItem, EdgeCandidate, PanelValues } from './values'

const ARROW = String.fromCharCode(0x2192)

const LEAST_SPRINTS = 8

const PAST_THE_END = 2

const UNCLAIMED = 'Unclaimed rail'

interface Feature {
  readonly id: string
  readonly epicId: string
  readonly labelId: string | null
  readonly name: string
  readonly dependsOn: readonly string[]
}

const spanOf = (plan: PlanScreenModel, id: string): Span | undefined =>
  plan.schedule.spans.find((span) => span.id === id)

const byPosition = <T extends { readonly id: string; readonly position: number }>(
  group: readonly T[],
): readonly T[] => [...group].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))

const lastDay = (span: Span): number => Math.max(span.startDay, span.endDay - 1)

const sprintTotal = (plan: PlanScreenModel, calendar: PlanCalendar): number => {
  const ends = plan.schedule.spans.map((span) => sprintOf(lastDay(span), calendar) + PAST_THE_END)
  return Math.min(pinCeiling(calendar.sprintLengthDays), Math.max(LEAST_SPRINTS, ...ends))
}

/**
 * The hue a feature is painted in: its group's where it has one, otherwise its rail's.
 *
 * The one rule, in one place, because four surfaces paint by it and a reader matches them to each
 * other: the bar on the canvas, the dot on a dependency chip, the swatch in the Epic picker and the
 * marker on the panel's own tab. `canvas/view.ts` states it for the marks; this is the same rule for
 * everything the panel draws, and the two cannot drift because neither reads a palette of its own.
 *
 * @param plan - The plan both lookups are made in.
 * @param feature - The feature to paint, or `undefined` for one the plan no longer holds.
 * @returns A CSS colour, or `''` where neither a group nor a claimed rail gives one.
 */
export const hueOfFeature = (
  plan: PlanScreenModel,
  feature: { readonly epicId: string; readonly labelId: string | null } | undefined,
): string => {
  if (feature === undefined) return ''
  const grouped = plan.labels.find((label) => label.id === feature.labelId)
  return grouped?.colour ?? plan.epics.find((epic) => epic.id === feature.epicId)?.colour ?? ''
}

const candidateOf = (plan: PlanScreenModel, feature: Feature, calendar: PlanCalendar): EdgeCandidate => {
  const span = spanOf(plan, feature.id)
  return {
    colour: hueOfFeature(plan, feature),
    ends: span === undefined ? '' : dayToDate(lastDay(span), calendar),
    id: feature.id,
    name: feature.name,
    railName: plan.epics.find((epic) => epic.id === feature.epicId)?.name ?? UNCLAIMED,
  }
}

const familyOf = (plan: PlanScreenModel, featureId: string): readonly ChildItem[] =>
  byPosition(plan.items.filter((item) => item.featureId === featureId)).map((item) => ({
    estimateDays: item.estimateDays,
    id: item.id,
    name: item.name,
  }))

/** What one subject's panel is asked to draw, which is two ids and the plan both are looked up in. */
export interface PanelQuery {
  /** The plan every lookup below is made in. */
  readonly plan: PlanScreenModel

  /** Its calendar, which is what turns a working-day offset into a date and a sprint. */
  readonly calendar: PlanCalendar

  /** The subject itself: a feature, or an item. */
  readonly subjectId: string

  /** The feature in play: the subject, or the feature an open item belongs to. */
  readonly featureId: string
}

/**
 * Everything the panel shows and no field writes, resolved in one pass over one plan.
 *
 * It is a server function and that is the point of it: every member takes a second record to answer —
 * a span for the dates and the sprint, the items array for the list, every other feature for the
 * dependency search, and for each of those its rail and its hue. A client component could reach none
 * of them without being handed the plan, which ADR 0033 refuses, so the panel is handed the readings
 * instead.
 *
 * `candidates` excludes the feature in play and nothing else: a feature may not wait on itself, and
 * every other feature of the plan is offerable even where the edge would close a loop — the search
 * **greys** such a row rather than dropping it, because "can this wait on that" is the question being
 * asked and a list that omits the answer reads as a plan missing a feature (`./cycle-check.ts` words
 * the refusal).
 *
 * @param query - The plan, its calendar, and the two ids in play.
 * @returns The panel's display values, all of them already worded.
 */
export function panelValues(query: PanelQuery): PanelValues {
  const { plan, calendar, subjectId, featureId } = query
  const span = spanOf(plan, subjectId)
  const features: readonly Feature[] = plan.features
  const here = features.find((one) => one.id === featureId)
  return {
    atTheEnd: Math.max(plan.items.length, plan.features.length),
    candidates: features
      .filter((one) => one.id !== featureId)
      .map((one) => candidateOf(plan, one, calendar)),
    dates:
      span === undefined
        ? ''
        : `${dayToDate(span.startDay, calendar)} ${ARROW} ${dayToDate(lastDay(span), calendar)}`,
    family: familyOf(plan, featureId),
    hereColour:
      subjectId === featureId
        ? (plan.epics.find((epic) => epic.id === here?.epicId)?.colour ?? '')
        : hueOfFeature(plan, here),
    scheduledSprint: span === undefined ? null : sprintOf(span.startDay, calendar),
    sprintTotal: sprintTotal(plan, calendar),
    unblocks: features
      .filter((one) => one.dependsOn.includes(subjectId))
      .map((one) => candidateOf(plan, one, calendar)),
  }
}
