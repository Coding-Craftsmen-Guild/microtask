import type { PlanScreenModel } from '../plan-screen-model'
import { tableRows, type TableRow } from '../table/rows'
import { subjectValues, type DrawerValues, type SubjectKind } from './values'

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

  /** The same subject's editable values, which are numbers and names rather than sentences. */
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
 * @returns The row and the values, or `undefined` when no row of that kind answers to that id.
 */
export function drawerSubject(
  plan: PlanScreenModel,
  kind: SubjectKind,
  id: string,
): DrawerSubject | undefined {
  const row = tableRows(plan).find((one) => one.kind === kind && one.id === id)
  const values = subjectValues(plan, kind, id)
  return row === undefined || values === undefined ? undefined : { row, values }
}
