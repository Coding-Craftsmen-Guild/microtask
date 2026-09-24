import type { Plan } from '@repo/api-client'
import type { TableRow } from '../table/rows'

/**
 * Which of the two things a drawer can be open on, which decides where a value is read back from.
 *
 * `TableRow['kind']` itself, reached through an `import type` that compiles to nothing: a client field
 * imports this module, and the type import is erased before any bundler sees it, so naming the row's
 * own union here costs the browser neither `@repo/canvas` nor `@repo/schedule`. One union rather than
 * two spellings of it, so `'feature' | 'item'` cannot mean one thing in a field and another in the
 * table. `subject.ts` is where the value side of that module meets this one, and it imports both.
 */
export type SubjectKind = TableRow['kind']

/**
 * The two fields of a feature or an item that are **values** rather than sentences.
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
 */
export interface DrawerValues {
  /** The name as stored, before any collapsing a rename would do to it. */
  readonly name: string

  /** The authored estimate in working days, `0` for a milestone, `null` for nothing sized. */
  readonly estimateDays: number | null
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
 * @param plan - Any plan-shaped value: the page's reduced model, or a write's answer.
 * @param kind - Which array to look in, features or items.
 * @param id - The subject's own id.
 * @returns Its name and authored estimate, or `undefined` when that plan no longer holds it.
 */
export function subjectValues(
  plan: Omit<Plan, 'shareLinks'>,
  kind: SubjectKind,
  id: string,
): DrawerValues | undefined {
  const found =
    kind === 'feature'
      ? plan.features.find((one) => one.id === id)
      : plan.items.find((one) => one.id === id)
  return found === undefined ? undefined : { name: found.name, estimateDays: found.estimateDays }
}
