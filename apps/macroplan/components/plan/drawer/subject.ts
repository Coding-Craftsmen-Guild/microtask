import { breakdown, effectiveEstimate, type PlanCalendar } from '@repo/schedule'
import type { PlanScreenModel } from '../plan-screen-model'
import { tableRows, type TableRow } from '../table/rows'
import { subjectValues, type DrawerValues, type SubjectKind } from './values'


const calendarOf = (plan: PlanScreenModel): PlanCalendar => ({
  startDate: plan.startDate,
  sprintLengthDays: plan.sprintLengthDays,
  timezone: plan.timezone,
})

const sizedByItems = (plan: PlanScreenModel, kind: SubjectKind, id: string): boolean => {
  const feature = kind === 'feature' ? plan.features.find((one) => one.id === id) : undefined
  if (feature === undefined) return false
  const items = plan.items.filter((one) => one.featureId === id)
  if (breakdown(feature, items) !== null) return true
  return feature.estimateDays === null && effectiveEstimate(feature, items) !== null
}

/**
 * The one feature or item a drawer is open on, in the two shapes a panel needs it in.
 *
 * Both halves come out of **one lookup of one plan object**, which is what keeps them the same
 * record: a row found here and a record found somewhere else could name two subjects, and the panel
 * would then read a name off one and a sentence off the other.
 */
export interface DrawerSubject {
  /** Every column the table already worded, which is what the panel's `<dl>` reads (`../table/rows.ts`). */
  readonly row: TableRow

  /**
   * The same subject's values: the numbers and names a control edits, and the two a fact reads.
   *
   * Wider than what {@link subjectValues} answers, and the difference is the point of resolving a
   * subject here rather than in a page: the plan's calendar and which of a feature's two estimates
   * sized it are both needed by the panel and carried by neither the row nor the record, so they are
   * added **inside the one lookup** rather than fetched beside it (`./values.ts` argues each).
   */
  readonly values: DrawerValues
}

/**
 * One subject resolved out of a plan, as both the words a reader sees and the values a field edits.
 *
 * ### Why both, and why this is not two sources of truth for one fact
 *
 * The seam the drawer pages already used is worded **for display**: `TableRow.estimate` is a sentence
 * §3.2 fixes — `planned 40d · broken down to 5d · -35d` for a feature whose items disagree with it,
 * `no estimate` for one nobody has sized — and `rows.ts` is deliberately the only place those words
 * are chosen, so the table and the panel beside it cannot word one plan two ways. A field cannot be
 * built on any of that: it needs `Auth rewrite` and `40`, and a number parsed back out of a sentence
 * would be a second implementation of the wording, in the direction that has no tests.
 *
 * So both arrive, and neither is derived from the other: `tableRows` decides every string, and
 * {@link subjectValues} reads the two raw values straight off the plan. There is exactly one fact they
 * both touch — an item's estimate, which the row words as `3d` and the field holds as `3` — and even
 * there they are two different readings rather than two copies: the row's number is the schedule's
 * (`effectiveEstimate` over a feature's items), and the field's is the authored field the API stores.
 * On a feature with a breakdown the two are visibly different numbers, which is why the `<dl>` keeps
 * saying what the schedule made of the estimate while the field edits what was authored.
 *
 * The alternative was to hand the panel the plan and let it take what it wanted, and that is the one
 * thing this signature refuses: a panel holding a plan is a panel that can word an estimate itself,
 * and — for the admin, whose read carries every live seat — a plan is also the thing ADR 0033 forbids
 * putting in a page's props at all.
 *
 * ### Two things the plan knows that neither half carried
 *
 * `sizedByItems` is the one question the drawer's read half asks about the pair, and it is asked here
 * because `breakdown()` and `effectiveEstimate()` are **values** from `@repo/schedule` and this is the
 * server module: `./values.ts` is imported by three client fields and may name their types only. The
 * answer is `effectiveEstimate`'s own gate — at least one estimated item, which is when the items and
 * not the authored number place the bar (`packages/schedule/src/estimate.ts`) — and it is reached by
 * asking the two exported functions rather than by counting sized items here, so nothing in this app
 * decides that condition a second time (ADR 0051).
 *
 * It takes **two** questions because `breakdown()` is the narrower of the two: a pair needs an authored
 * estimate as well as a sized item, so it answers `null` for a feature whose items are sized and whose
 * own estimate nobody wrote — a feature the items place all the same, and whose estimate field is just
 * as inert. `effectiveEstimate` answering non-`null` where `estimateDays` is `null` is exactly that
 * state, and `./breakdown-line.tsx` is where what the drawer would otherwise be silent about is written
 * out. Neither call reads the delta's **sign**: a part-sized breakdown under a whole-feature estimate is
 * a real state and never an error. `sizedByItems` asks only for a feature, an item having no items of
 * its own, and filters `plan.items` by `featureId` for the one feature rather than building the whole
 * `itemsByFeature` map a second time.
 *
 * The calendar is the plan's three scheduling fields and never the plan. `rangeOfSprint` needs them to
 * say what sprint a pin means in dates, and that conversion happens in the browser as the number is
 * typed — so the fields travel, and `./pin-field.tsx` is handed the three of them as primitives.
 *
 * ### One derivation, and one existence check
 *
 * `tableRows` is `cache()`d on the plan object and `readPlan` is `cache()`d on the plan id, so the
 * rows this walks are the same rows the table beside it is drawing rather than a second build of all
 * 2,200 (`../table/rows.ts`).
 *
 * The row is the existence check, and it stays the narrower of the two on purpose. Every feature the
 * plan holds has a row — `railsOf` gives a feature whose `epicId` names no epic a rail of its own —
 * but an item whose `featureId` names no feature in the plan has **none**, because `itemsByFeature`
 * groups it under an id nothing asks for. Such an item is still in `plan.items`, so `subjectValues`
 * alone would have found it and the panel would have drawn a name against three blanks with no rail,
 * no feature and no sprint to place it in. Resolving through the row keeps that a `notFound()`, which
 * is the answer `i/[itemId]/page.tsx` already argued for.
 *
 * @param plan - The reduced plan the page read, whose type cannot carry a seat.
 * @param kind - Which segment is asking: `f/[featureId]` or `i/[itemId]`.
 * @param id - The id out of the URL, untrusted.
 * @returns The row, the values, the calendar and whether the items sized this feature, or `undefined`
 * when no row of that kind answers to that id.
 */
export function drawerSubject(
  plan: PlanScreenModel,
  kind: SubjectKind,
  id: string,
): DrawerSubject | undefined {
  const row = tableRows(plan).find((one) => one.kind === kind && one.id === id)
  const values = subjectValues(plan, kind, id)
  if (row === undefined || values === undefined) return undefined
  return {
    row,
    values: {
      ...values,
      calendar: calendarOf(plan),
      sizedByItems: sizedByItems(plan, kind, id),
    },
  }
}
