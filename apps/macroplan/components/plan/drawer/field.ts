import type { Plan } from '@repo/api-client'
import type { ActionResult } from '../../../actions/result'
import { MAX_ESTIMATE_DAYS, MAX_ITEM_DESCRIPTION_BYTES } from '@repo/contracts'
import type { KeyboardEvent } from 'react'

const ENCODER = new TextEncoder()

/** Why an estimate that is not a whole number of days is refused, in the field's own words. */
export const WHOLE_DAYS =
  'An estimate is a whole number of days, 0 or more — or empty for work nobody has sized yet.'

/** Why an estimate past the contract's maximum is refused, naming the maximum. */
export const TOO_MANY_DAYS = `An estimate cannot be more than ${String(MAX_ESTIMATE_DAYS)} days.`

const STRIPPED_CODES = [...[...Array(32).keys()].filter((code) => code !== 9 && code !== 10), 127]

const STRIPPED = new RegExp(
  `[${STRIPPED_CODES.map((code) => String.fromCharCode(code)).join('')}]`,
  'gu',
)

/**
 * One field of one subject, written: the plan, the subject, and the new value.
 *
 * The shape every write a drawer field takes already has — `renameFeature`, `estimateFeature`,
 * `renameItem`, `estimateItem` and `describeItem` are each assignable to it — so a field takes a
 * `PlanEditActions` member as a prop without naming the interface, and cannot reach a second one.
 *
 * It answers the **whole plan**, which is what every action behind it answers, and that is the point
 * rather than an accident: `subjectValues` (`./values.ts`) reads this subject's stored values back out
 * of it, so what a field shows after a write is what the server kept and not what was typed. The plan
 * reaches the browser as the **answer to a call** and never as a prop — no client file under
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

/**
 * The band every control group is drawn in, below the facts the same panel opens with.
 *
 * `empty:hidden` is what keeps a surface that may write nothing from being shown a bordered box with
 * nothing in it, and it is a variant rather than a count so the condition cannot fall out of step with
 * the groups inside it. It lives here beside the other four class names for the reason {@link LABEL}
 * gives: one typographic thing is one constant, and a second group mounted in a second file must draw
 * the same band rather than a string that looks like it.
 */
export const EDITS = 'grid gap-3 border-t border-foreground/10 pt-3 empty:hidden'

/** What an estimate field says about its own three states, before anything has been refused. */
export const ESTIMATE_HINT =
  'Days of work. Empty means nobody has sized it; 0 is a milestone that takes no time.'

/**
 * What a pin field says about the rule, whenever there is no sprint in the box to date.
 *
 * Here rather than beside the field that draws it, for the reason {@link ESTIMATE_HINT} is here: a
 * hint is a bare string, and this module is where a drawer field's strings live so that the `.tsx`
 * holding the control is only the control. `pinHint` stays in `./pin-field.tsx` because it calls
 * `rangeOfSprint` and so is a **reading of the plan's calendar** rather than a constant, and that file
 * is the tightest of the drawer's components against its 80-line cap.
 */
export const PIN_HINT =
  'Sprints are counted from 1, as the table numbers them. Empty means no pin. A pin is a floor: it can only delay a feature, never move it earlier.'

/**
 * The quiet line under something that is not a refusal: a remaining budget, or a fact worth stating.
 *
 * One constant for the two places a drawer draws a quiet line — under the description box, where it is
 * the byte budget, and under the facts `<dl>`, where `./breakdown-line.tsx` draws one sentence — for the
 * reason {@link LABEL} gives: they are one typographic thing, and the same string under two names is a
 * diff away from claiming they are two. It said "under a field" while it had one use; a second use that
 * is not a field's widened the wording rather than starting a second constant.
 */
export const BUDGET = 'text-[12px] text-muted-foreground'

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

/**
 * What `cleanDescription` would make of this text, minus the truncation the field refuses instead.
 *
 * The domain does **three** things to a description and the byte cap is only the third:
 * `cleanDescription` (`packages/macroplan-domain/src/limits.ts`) normalises `\r\n` and a lone `\r` to
 * `\n`, strips every C0 control character except `\n` and `\t` along with `U+007F`, and only then
 * truncates. A field that refused the truncation alone was still entitled to nothing: a pasted
 * `U+000B` was stored **stripped** while the box went on showing it and reporting success, which is the
 * exact failure the "show what the server stored" rule exists to prevent — and this field cannot read
 * its answer back, `describeItem` answering a plan that carries no descriptions.
 *
 * So the same two normalisations happen here, before the comparison, the count and the send, and the
 * box is repainted with what went out. The set is built from character **codes** rather than a regex
 * literal of escapes — every C0 code but tab and newline, plus DEL — which is both how the domain
 * builds it and, per that module's own note, the spelling a tool in this pipeline cannot silently
 * mangle into a raw control byte. It is rebuilt rather than imported because `apps/macroplan` may not
 * import `@repo/macroplan-domain` at all (ADR 0014, ADR 0027); `field.test.ts` pins the set against
 * the rule in words, so a change to either has to be a change to both.
 *
 * The order matters and is the domain's: normalise first, strip second. `\r` is itself in the stripped
 * set, so stripping first would delete a lone `\r` the server turns into a newline.
 */
export const normalisedDescription = (typed: string): string =>
  typed.replace(/\r\n|\r/gu, '\n').replace(STRIPPED, '')

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

/**
 * Escape alone reverts and leaves, for the one field where Enter is a character the user meant.
 *
 * The other half of {@link commitKeys}, and not a variant of it: a `<textarea>` must keep Enter as a
 * newline, and abandoning an edit is the half of the idiom that has nothing to do with Enter. Without
 * it a description that had been half-rewritten could only be committed or repaired by hand, which is
 * the one gesture every other field in this drawer offers.
 *
 * Reverting **and** blurring rather than reverting alone: the blur is what the field commits on, and a
 * box holding the stored text again is a commit that sends nothing and clears any standing refusal.
 */
export const revertKey = (event: KeyboardEvent<HTMLTextAreaElement>, stored: string): void => {
  if (event.key !== 'Escape') return
  event.currentTarget.value = stored
  event.preventDefault()
  event.currentTarget.blur()
}

/**
 * The largest sprint number the pin field accepts, counted from 1, for a plan of this sprint length.
 *
 * **This ceiling is the client's, because the contract does not have one.** `SprintIndex` is
 * `z.number().int().min(0)` and nothing more (`packages/contracts/src/plan.ts`), and its own note
 * argues for that: "a plan's sprint count falls out of the schedule it produces, it is never
 * authored, so a pin naming a sprint past today's horizon is not a mistake to reject — it is a
 * constraint the forward pass has not grown into yet". That is right about the **store** and wrong
 * about a keyboard: `500` typed where `50` was meant is accepted, and a pin is the only way a fixed
 * point in time enters the model (spec §3.1), so the feature moves a decade out and the API reports
 * success. The server will not sanity-check it, so the field does, and it refuses rather than clamps
 * — a silently corrected pin would be a different plan than the one that was typed.
 *
 * The number is derived from {@link MAX_ESTIMATE_DAYS}, the largest estimate this product accepts on
 * a single feature — 1,000 working days, "about four years" (`packages/contracts/src/limits.ts`) —
 * divided by **this plan's own** sprint length. So the same wall-clock distance is the same number of
 * days for every plan and a different number of sprints: 72 for Atlas's fourteen-working-day sprints,
 * 1,000 for a one-day sprint. Every pin it accepts starts strictly inside those 1,000 days, which is
 * the property that makes the division the right one: `L * (ceil(N / L) - 1) < N` for every sprint
 * length `L`, because `ceil(N / L) - 1 < N / L`, and `L * (ceil(N / L))` is at least `N` — so the last
 * sprint this field accepts begins within the horizon and the first one it refuses does not.
 *
 * **It is a typo heuristic, not this plan's horizon**, and the two are not the same distance.
 * `MAX_ESTIMATE_DAYS` bounds one feature's estimate and nothing bounds a plan's span:
 * `LIMITS.featuresPerPlan` is 200, so fifteen 100-day features on one rail already run to working day
 * 1,500, whose sprint is `S108` at Atlas's length — a real sprint of a real plan that this field would
 * refuse to pin to. It is a guard against `500` typed where `50` was meant, and it is stated in the one
 * distance this product already refuses to estimate past rather than in a round number somebody chose;
 * what would replace it is a bound derived from the plan's own schedule, which is the thing the
 * contract's note says is "never authored" and which no field has to hand.
 *
 * @param sprintLengthDays - The plan's own sprint length in working days, at least 1 per contract.
 * @returns The largest 1-based sprint number this field will send, which is neither a contract bound
 * nor a claim about how far this plan reaches.
 */
export const pinCeiling = (sprintLengthDays: number): number =>
  Math.ceil(MAX_ESTIMATE_DAYS / sprintLengthDays)

/** Why a pin that is not a whole sprint counted from 1 is refused, in the field's own words. */
export const WHOLE_SPRINTS =
  'A pin is a whole sprint number counted from 1 — or empty for a feature that is not pinned.'

/**
 * Why a pin past the field's own ceiling is refused, naming the ceiling and where it comes from.
 *
 * It says what the bound **is** rather than what the plan reaches: {@link pinCeiling} is derived from
 * the largest estimate one feature may carry, and a plan may legitimately run past it (see there). So
 * the sentence claims only that sprint 72 is the last one starting inside that distance, which is true
 * of every plan of this sprint length, and offers the typo as the likelier reading rather than as the
 * only one.
 *
 * @param sprintLengthDays - The plan's own sprint length, which is what the ceiling is derived from.
 * @returns The sentence to show under the field.
 */
export const tooFarOut = (sprintLengthDays: number): string =>
  `Sprint ${String(pinCeiling(sprintLengthDays))} is the last one starting inside the ${String(MAX_ESTIMATE_DAYS)} working days this product will estimate a single feature at. Anything past that is a typo more often than a plan.`

/**
 * What a pin field will send for the text it holds, or the sentence it refuses with.
 *
 * `sprint` is the **0-based** `pinSprint` the contract stores, and `null` is the unpin — the same
 * two-state read {@link EstimateEntry} makes of an estimate, minus the third: there is no pin that
 * means "pinned to nothing in particular", so an empty box is the only absence.
 *
 * The **text** is 1-based and the value is not, because `S1` is what the table calls the plan's first
 * sprint (`../table/rows.ts`) and `sprintOf`'s own note says a UI adds one to label it. A field that
 * showed the stored 0 beside a table saying `S1` would have a reader pin to 2 for a sprint the rest of
 * the screen calls 3. So `0` is refused rather than read as sprint 0: there is no sprint 0 on this
 * screen, and a `0` typed into a box counted from 1 is the off-by-one itself arriving.
 */
export type PinEntry =
  | { readonly kind: 'pin'; readonly sprint: number | null }
  | { readonly kind: 'refused'; readonly detail: string }

/**
 * What a pin field will send for the text it holds, or why it is sending nothing.
 *
 * Digits only, for the reason {@link estimateEntry} gives: the regex is what keeps `0x10`, `1e3` and
 * `  -0 ` out — every spelling `Number()` would have accepted and no user meant — and the field is a
 * text input rather than `type="number"` so that a typo survives to be refused instead of being
 * emptied by the HTML sanitisation algorithm and read as an unpin.
 *
 * @param typed - Exactly what the field holds, untrimmed, counted from 1.
 * @param sprintLengthDays - The plan's own sprint length, which fixes the ceiling.
 * @returns The 0-based sprint to send — `null` for the unpin — or the refusal to show instead.
 */
export function pinEntry(typed: string, sprintLengthDays: number): PinEntry {
  const trimmed = typed.trim()
  if (trimmed === '') return { kind: 'pin', sprint: null }
  if (!/^[0-9]+$/.test(trimmed)) return { kind: 'refused', detail: WHOLE_SPRINTS }
  const labelled = Number(trimmed)
  if (labelled === 0) return { kind: 'refused', detail: WHOLE_SPRINTS }
  if (labelled > pinCeiling(sprintLengthDays)) {
    return { kind: 'refused', detail: tooFarOut(sprintLengthDays) }
  }
  return { kind: 'pin', sprint: labelled - 1 }
}

const EDGE_SEPARATOR = ' '

/**
 * One feature's `dependsOn` list, as the single string a client component may be handed.
 *
 * **A list cannot cross into the browser here.** `module-boundaries.test.tsx` requires every prop
 * reaching a client component to be a primitive, an unbound function or `null` — an array is none of
 * those — and that is the rule rather than an oversight: what a client component is handed is
 * serialised into the Flight payload and lands in the HTML, so the shapes that may cross are
 * enumerated rather than trusted (ADR 0033, ADR 0040). A dependency control has to send a **whole**
 * list, `PUT .../dependencies` having no add and no remove, so the list travels as one string and the
 * control splits it back the instant before it calls the action.
 *
 * A space is the separator because no id can contain one: `EntityId` is
 * `/^[0-9A-HJKMNP-TV-Z]{26}$/` — a ULID in Crockford base32 — so the alphabet and the separator are
 * disjoint by the contract rather than by convention (`packages/contracts/src/document.ts`).
 *
 * These two live here rather than beside the cycle check that builds the string for the reason
 * {@link LABEL} gives: `./cycle-check.ts` imports `findCycles` as a **value**, and a client control
 * importing the codec from there would pull the graph walk into the browser bundle to reach a
 * `join`. This module names `@repo/contracts` and nothing else, which is why every client field in
 * this drawer already imports it.
 */
export const joinEdges = (ids: readonly string[]): string => ids.join(EDGE_SEPARATOR)

/**
 * The list back out of {@link joinEdges}, which is what a control sends.
 *
 * The empty list is the case that matters, and it is why this is a named function rather than a
 * `.split()` at the call: `''.split(' ')` answers `['']`, so a control clearing a feature's last
 * dependency would have sent one edge naming nothing rather than none — a 422 for a write that was
 * meant to remove everything. Empty segments are dropped instead, which also makes the round trip
 * total for any list this app can build.
 */
export const splitEdges = (ids: string): readonly string[] =>
  ids.split(EDGE_SEPARATOR).filter((one) => one !== '')

/**
 * What a dependency editor says where the plan holds no other feature to wait on.
 *
 * Here for the reason {@link PIN_HINT} is here: a hint is a bare string, and this module is where a
 * drawer control's strings live so that the `.tsx` holding the control is only the control. It says
 * what is missing rather than drawing an empty list, because an editor with no rows and no sentence
 * reads as a control that failed to load — and the candidate list is exhaustive by construction, this
 * plan's own features being every edge there could be (spec §8).
 */
export const NOTHING_TO_WAIT_ON =
  'This is the only feature in the plan, so there is nothing for it to wait on. A dependency always names another feature of this plan.'
