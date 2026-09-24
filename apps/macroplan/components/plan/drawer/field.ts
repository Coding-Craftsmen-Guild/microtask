import type { Plan } from '@repo/api-client'
import type { ActionResult } from '../../../actions/result'
import { MAX_ESTIMATE_DAYS, MAX_ITEM_DESCRIPTION_BYTES } from '@repo/contracts'
import type { KeyboardEvent } from 'react'

const ENCODER = new TextEncoder()

const WHOLE_DAYS =
  'An estimate is a whole number of days, 0 or more — or empty for work nobody has sized yet.'

const TOO_MANY_DAYS = `An estimate cannot be more than ${String(MAX_ESTIMATE_DAYS)} days.`

/**
 * Which of the two things a drawer can be open on, which decides where a value is read back from.
 *
 * `TableRow['kind']`'s own two members, spelled here rather than imported from `../table/rows`,
 * because a client field may not reach that module: it pulls `@repo/canvas` and `@repo/schedule` in
 * with it, and a field needs one word out of it. `subject.ts` is where the two meet, and it imports
 * both.
 */
export type SubjectKind = 'feature' | 'item'

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
 * One field of one subject, written: the plan, the subject, and the new value.
 *
 * The shape every write a drawer field takes already has — `renameFeature`, `estimateFeature`,
 * `renameItem`, `estimateItem` and `describeItem` are each assignable to it — so a field takes a
 * `PlanEditActions` member as a prop without naming the interface, and cannot reach a second one.
 *
 * It answers the **whole plan**, which is what every action behind it answers, and that is the point
 * rather than an accident: {@link subjectValues} reads this subject's stored values back out of it, so
 * what a field shows after a write is what the server kept and not what was typed. The plan reaches
 * the browser as the **answer to a call** and never as a prop — no client file under
 * `components/plan` receives one, which `module-boundaries.test.tsx` asserts of the props themselves.
 */
export type SubjectWrite<Value> = (
  planId: string,
  subjectId: string,
  value: Value,
) => Promise<ActionResult<Plan>>

/**
 * What a field decided about what was typed in it: a value to send, or why it is sending nothing.
 *
 * `days` is `null` for an empty field, which is the third state a string field does not have: in
 * `apps/microtask`'s `InlineName` an empty box means "no change, send nothing", and here it is a
 * value worth sending — the clear that `estimateFeature(planId, id, null)` exists for.
 */
export type EstimateEntry =
  | { readonly kind: 'days'; readonly days: number | null }
  | { readonly kind: 'refused'; readonly detail: string }

/**
 * The small uppercase label this drawer draws over every fact and every field.
 *
 * One constant because they are one typographic thing, and the same string under two names would be
 * a diff away from claiming they are two. It lives in this module rather than beside either use so
 * that a client field and the server-rendered `<dl>` share the definition without the field pulling a
 * component into the browser bundle to get at it.
 */
export const LABEL = 'text-[11px] font-semibold tracking-wide text-muted-foreground uppercase'

/** The box itself: one border that answers hover and focus, sized for the drawer's 13px text. */
export const FIELD =
  'w-full rounded-md border border-border bg-card px-2 py-1 text-[13px] outline-none hover:border-foreground/30 focus:border-gold-deep'

/** The refusal line under a field, which is `role="alert"` wherever this is used. */
export const PROBLEM = 'text-[12.5px] text-destructive'

/** What an estimate field says about its own three states, before anything has been refused. */
export const ESTIMATE_HINT =
  'Days of work. Empty means nobody has sized it; 0 is a milestone that takes no time.'

/** The quiet line under a field that is not a refusal: a remaining budget, or a rule worth repeating. */
export const BUDGET = 'text-[12px] text-muted-foreground'

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

/**
 * What an estimate field will send for the text it holds, or the sentence it refuses with.
 *
 * Three states and not two. Empty is `null`, **nothing was sized**; `0` is a milestone, a real
 * estimate meaning no time; anything else is that many working days. `0` and empty are therefore two
 * different commits, and a truthiness test anywhere near this function would merge them — which is
 * the mistake `effectiveEstimate` refuses by name, because three items estimated at 0 must answer 0
 * and override an authored 40 rather than resurrecting it.
 *
 * It is a **string** in and not `valueAsNumber`, and the field is `inputMode="numeric"` rather than
 * `type="number"`, for one reason: the HTML value sanitisation algorithm empties a number input whose
 * content is not a valid floating-point number, so `2.5x` and `abc` both read back as `''` — which
 * this function is required to treat as a **clear**. A field built that way would delete a real
 * estimate for a typo and report success. Here the text survives, so it can be refused.
 *
 * What it refuses, it refuses because the contract does: `EstimateDays` is `int().min(0).max(1000)`,
 * so a fraction, a negative and a thousand-and-one are each a 422 whose detail is the API's generic
 * one. Refusing in the field is what puts a sentence in front of the user that names the field's own
 * rule. The regex admits digits only, which is also what keeps `0x10`, `1e3` and `  -0 ` out — every
 * spelling `Number()` would have accepted and no user meant.
 *
 * @param typed - Exactly what the field holds, untrimmed.
 * @returns The value to send — `null` included — or the refusal to show instead.
 */
export function estimateEntry(typed: string): EstimateEntry {
  const trimmed = typed.trim()
  if (trimmed === '') return { kind: 'days', days: null }
  if (!/^[0-9]+$/.test(trimmed)) return { kind: 'refused', detail: WHOLE_DAYS }
  const days = Number(trimmed)
  if (days > MAX_ESTIMATE_DAYS) return { kind: 'refused', detail: TOO_MANY_DAYS }
  return { kind: 'days', days }
}

/**
 * How many **UTF-8 bytes** a description costs, which is the only count that matters about one.
 *
 * `description.length` counts UTF-16 units, and no character ever encodes to fewer UTF-8 bytes than
 * it does units — an emoji is 2 units and 4 bytes — so a `.length` check is always the permissive
 * one. It can only under-report, which means it waves through exactly the strings the domain
 * truncates: `cleanDescription` in `@repo/macroplan-domain` shortens anything over
 * `MAX_ITEM_DESCRIPTION_BYTES` at the last whole code point and the route answers **200**, so a
 * caller that trusted a character count would be told it succeeded while the tail of what was
 * written was dropped.
 */
export const descriptionBytes = (text: string): number => ENCODER.encode(text).length

/** Whether a description of this many bytes is one the domain would silently shorten. */
export const overBudget = (bytes: number): boolean => bytes > MAX_ITEM_DESCRIPTION_BYTES

/**
 * The budget under the description box: what is left, or how far past the cap it already is.
 *
 * On screen from the first keystroke rather than only once it matters, because the thing being
 * prevented is invisible: a user who learns about the cap when the text is already over it has
 * already written the part that would be dropped.
 */
export const budgetLine = (bytes: number): string =>
  overBudget(bytes)
    ? `${String(bytes - MAX_ITEM_DESCRIPTION_BYTES)} bytes over the ${String(MAX_ITEM_DESCRIPTION_BYTES)}-byte cap`
    : `${String(MAX_ITEM_DESCRIPTION_BYTES - bytes)} of ${String(MAX_ITEM_DESCRIPTION_BYTES)} bytes left`

/** Why a description is not sent at all, said in terms of what the API would otherwise do to it. */
export const OVER_BUDGET = `This is past the ${String(MAX_ITEM_DESCRIPTION_BYTES)}-byte cap. The API keeps what fits and drops the rest without saying so, so shorten it and try again.`

/**
 * Writes a value into a field **unless the user is in it**.
 *
 * Every write to a field goes through here, including the late answer to a commit the user has
 * already moved past: a re-render driven by something else, or a slow rename answering after the
 * cursor came back, would otherwise replace what is being typed mid-word. `apps/microtask`'s
 * `InlineName` guards the same thing the same way, and the app being replaced guarded it explicitly.
 */
export const paintUnfocused = (
  field: HTMLInputElement | HTMLTextAreaElement | null,
  value: string,
): void => {
  if (field !== null && field.ownerDocument.activeElement !== field) field.value = value
}

/**
 * Enter commits and Escape reverts, both by leaving the field — so one blur handler commits either.
 *
 * Not for the description, which is a `<textarea>` where Enter is a newline the user meant.
 */
export const commitKeys = (event: KeyboardEvent<HTMLInputElement>, stored: string): void => {
  if (event.key === 'Escape') event.currentTarget.value = stored
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault()
    event.currentTarget.blur()
  }
}
