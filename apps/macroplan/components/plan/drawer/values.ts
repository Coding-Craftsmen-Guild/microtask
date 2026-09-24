import type { Plan } from '@repo/api-client'
import type { PlanCalendar } from '@repo/schedule'
import type { TableRow } from '../table/rows'

/**
 * Which of the two things a drawer can be open on, which decides where a value is read back from.
 *
 * `TableRow['kind']` itself, reached through an `import type` that compiles to nothing: a client field
 * imports this module, and the type import is erased before any bundler sees it, so naming the row's
 * own union here costs the browser neither `@repo/canvas` nor `@repo/schedule`. One union rather than
 * two spellings of it, so `'feature' | 'item'` cannot mean one thing in a field and another in the
 * table. `subject.ts` is where the value side of that module meets this one, and it imports both.
 *
 * `@repo/schedule` is named once more below and never as a value, for that same reason: `PlanCalendar`
 * is an `import type`, so the shape this module's wider half is written in costs the browser nothing
 * either — and it is `subject.ts`, a server module, that calls `breakdown()` and `effectiveEstimate()`.
 */
export type SubjectKind = TableRow['kind']

/**
 * The three fields of a feature or an item that a **control** edits and reads back after a write.
 *
 * The estimate here is the **authored** number and not what the schedule made of it: a feature whose
 * items add up to something else still owns this field, and `effectiveEstimate` is a reading of both
 * (`packages/schedule/src/estimate.ts`). So this is not a second copy of `TableRow.estimate` — that
 * string is the schedule's verdict, wording a breakdown as `planned 40d · broken down to 5d · -35d`,
 * and no field can be edited from it.
 *
 * `estimateDays` is `number | null` and never `number | undefined`, because the contract's own
 * `EstimateDays.nullable()` is what `null` spells: **nothing was sized**. `0` is a different answer —
 * a milestone, reached and taking no time — and the two are told apart by `=== null` everywhere in
 * this product, the forward pass included.
 *
 * `pinSprint` is a **feature's** field alone: `PlanFeature` carries it and `PlanItem` does not
 * (`packages/contracts/src/plan.ts`), so this member is `null` for every item there has ever been,
 * and that is an absence of the field rather than an unpinned item. {@link subjectValues} answers it
 * from the branch it is looking in rather than from an optional read, so the two kinds cannot start
 * sharing a spelling for it.
 */
export interface SubjectValues {
  /** The name as stored, before any collapsing a rename would do to it. */
  readonly name: string

  /** The authored estimate in working days, `0` for a milestone, `null` for nothing sized. */
  readonly estimateDays: number | null

  /** The 0-based sprint a **feature** may not start before; `null` for unpinned, and for any item. */
  readonly pinSprint: number | null
}

/**
 * Everything about one subject that is a **value** rather than a sentence, controls and facts alike.
 *
 * {@link SubjectValues} is the part a field edits and re-reads out of the plan a write answered with.
 * The two members added here are neither edited nor re-read: they are what the drawer's **read** half
 * needs and the row does not carry, and they arrive by the same route for the same reason — the panel
 * is handed one subject rather than a plan (`./subject.ts`), so anything it needs about the plan has
 * to be resolved in that one lookup or not at all. A panel that reached for a plan to get at either
 * of them could word an estimate itself, and — for the admin, whose read carries every live seat —
 * would be holding the object ADR 0033 forbids putting in a page's props.
 *
 * `calendar` is the one member here that is not the subject's own, and it is here because a pin is
 * meaningless without it: `pinSprint` is an index into a grid whose width and origin belong to the
 * plan, so a control that shows a pin as the dates it means needs `startDate` and `sprintLengthDays`
 * to convert one. It is the three fields `PlanCalendar` names and never the plan, so what crosses into
 * the pin's client component is three primitives (`./pin-field.tsx`).
 *
 * `sizedByItems` is `effectiveEstimate`'s own gate, asked of this subject on the server: **at least one
 * estimated item**, which is when the items rather than the authored number place the bar and the
 * estimate field beside them is inert (`packages/schedule/src/estimate.ts`). It is `false` for every
 * item, an item having no items of its own. It is the one boolean rather than the pair because the
 * drawer's read half prints no number of the pair — every one of them is already in the row's Estimate
 * cell — so what it needs is which estimate the timeline used and not what the two came to
 * (`./breakdown-line.tsx`). `subject.ts` resolves it from `breakdown()` and `effectiveEstimate()`
 * themselves, so nothing in this app decides that condition a second time (ADR 0051).
 */
export interface DrawerValues extends SubjectValues {
  /** The plan's own calendar: what turns a sprint index into the dates it stands for. */
  readonly calendar: PlanCalendar

  /** Whether the items sized this feature, which is when its own estimate moves no bar. */
  readonly sizedByItems: boolean
}

/**
 * One subject's stored values, read out of a plan by id — the same read on both sides of a write.
 *
 * The server calls it to seed a field from the plan a page has already read, and a field calls it on
 * what its own write answered, so "what is on screen is what the server stored" is one function
 * rather than an intention. The API collapses a name's whitespace and truncates it at
 * `LIMITS.nameLength` (`cleanName`), so the two differ for real input.
 *
 * It takes `Omit<Plan, 'shareLinks'>` so that both a `PlanScreenModel` — the reduced plan a page
 * holds, whose type cannot carry a seat — and the `Plan` an action answers with satisfy it, without
 * this module naming the seat block at all.
 *
 * It answers {@link SubjectValues} and not {@link DrawerValues}, and that split is what keeps this
 * module out of `@repo/schedule`'s way: the wider shape's `sizedByItems` member would have to be
 * computed by `breakdown()` and `effectiveEstimate()`, both **values** from that package, and this
 * module is imported by three client fields — so the import would put the forward pass's estimate
 * module in the browser bundle to serve a fact no field reads. `subject.ts` adds the two wider members
 * instead, being a server module that already imports `tableRows`.
 *
 * The two kinds are looked up in separate branches rather than through one `found`, because the pin
 * exists on only one of them: a shared read would need `pinSprint` to be optional on both records,
 * which is exactly the claim `PlanItem` does not make.
 *
 * @param plan - Any plan-shaped value: the page's reduced model, or a write's answer.
 * @param kind - Which array to look in, features or items.
 * @param id - The subject's own id.
 * @returns Its name, authored estimate and pin, or `undefined` when that plan no longer holds it.
 */
export function subjectValues(
  plan: Omit<Plan, 'shareLinks'>,
  kind: SubjectKind,
  id: string,
): SubjectValues | undefined {
  if (kind === 'feature') {
    const feature = plan.features.find((one) => one.id === id)
    return feature === undefined
      ? undefined
      : { name: feature.name, estimateDays: feature.estimateDays, pinSprint: feature.pinSprint }
  }
  const item = plan.items.find((one) => one.id === id)
  return item === undefined
    ? undefined
    : { name: item.name, estimateDays: item.estimateDays, pinSprint: null }
}
