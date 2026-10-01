import { PLAN_ROOT } from '../shell/shell-css'
import { isStyleSafeId, type LabelRow } from './label-rows'

/** The `id` of the radio that selects one group, and the `for` of the chip that labels it. */
export const groupRadioId = (labelId: string): string => `mp-group-${labelId}`

/** The `id` of the radio that selects nothing, which is the state a plan is first drawn in. */
export const ALL_RADIO_ID = 'mp-group-all'

/** The `name` the radios share, so choosing one group unchooses the last. */
export const GROUP_RADIO_NAME = 'plan-group'

/** How much of a feature is left visible when a different group is chosen. */
/**
 * How faint the work that is *not* chosen goes.
 *
 * It was 0.12, and at twelve percent over a white card a coloured bar is indistinguishable from the
 * page: choosing a group did not emphasise it, it blanked the plan. The point of the selection is to
 * read one thread **against** the rest, so the rest has to stay legible — the reference tools quiet
 * the unmatched to roughly a third rather than erasing them.
 */
export const DIMMED_OPACITY = '0.32'

const ROOT = PLAN_ROOT

const DIMMABLE = [
  '[data-slot="feature-bar"]',
  '[data-slot="item-mark"]',
  '[data-slot="bar-label"]',
  '[data-slot="arc"]',
  '[data-slot="plan-table-row"]',
].join(',')

const ruleFor = (labelId: string): string =>
  `${ROOT}:has(#${groupRadioId(labelId)}:checked) :is(${DIMMABLE})` +
  `:not([data-label-id="${labelId}"])` +
  `{opacity:${DIMMED_OPACITY}}`

/**
 * One CSS rule per group: choosing a group dims everything that is not in it.
 *
 * ### Why this is generated CSS and not a class
 *
 * Tailwind's scanner reads class names as **text**, so no class can be chosen by a value that exists only
 * at runtime — the same wall `treatments.ts` hits with a rail's `#rrggbb`, which it solves with an inline
 * style. An inline style cannot solve this one: what has to change is the appearance of *other* elements
 * than the one that was clicked, on every rail and in the table at once, and an inline style reaches only
 * the element carrying it. A generated rule is the one mechanism that expresses "when this is chosen,
 * those are dimmed" with nothing to hydrate.
 *
 * ### Why `:has()` and not a sibling selector
 *
 * The view switch beside this uses `peer-checked`, which is `~` under the hood, and so requires its radios
 * to be siblings of the panels they control — which is why `plan-screen.tsx` may not wrap any part of that
 * markup. The chips here sit in the heading row and the bars are inside the switch, two subtrees apart, so
 * no sibling selector could reach from one to the other. `:has()` on their common ancestor asks the
 * question from above instead, which is what lets the chips live where an admin expects them.
 *
 * ### What a reader of the markup sees
 *
 * Nothing about a group is on a bar except `data-label-id`. There is no "selected" attribute anywhere,
 * because nothing on the server knows what is selected: the browser holds that in the radio, so a chosen
 * group survives no reload and reaches no URL. That is deliberate for what this is — a way of looking at
 * the plan for a moment, not a filter somebody shares — and it is why choosing a group re-renders nothing.
 *
 * ### What the rule selects, and the defect that changed it
 *
 * It was `[data-label-id]:not([data-label-id="X"])`, and that was wrong in a way that made the whole
 * feature look broken. A feature in **no** group renders `data-label-id={labelId ?? undefined}`, so the
 * attribute is *absent*, so `[data-label-id]` never matched it and it was never dimmed. The rule only
 * quieted features in some **other** group — and on a plan where most work is ungrouped, which is every
 * new plan, choosing a group visibly changed nothing.
 *
 * {@link DIMMABLE} names the slots instead, which says what was meant: dim every mark that is not in the
 * chosen group, whether it is in another one or in none.
 *
 * All five kinds are named for a reason. `bar-label` and `arc` carry a `data-label-id` for this rule and
 * nothing else; without them a feature's **name** stays bright over its own dimmed bar, which reads as a
 * rendering fault rather than a selection, and the arcs stay at full weight over a quiet plan. A
 * `plan-table-row` is here because the table is the second rendering of the same plan (ADR 0056) and the
 * chips filter both. An arc takes the label of the feature it **leaves** (`canvas/arc-view.ts`), so a
 * chosen group keeps its own outgoing edges lit.
 *
 * An id that is not ULID-shaped is **skipped** rather than escaped: it cannot occur, since every id here
 * came out of a `PlanView` decode, and a rule is the wrong place to be clever about a value that should
 * not exist. {@link isStyleSafeId} carries that argument.
 */
export function groupCss(rows: readonly LabelRow[]): string {
  return rows
    .filter((row) => isStyleSafeId(row.id))
    .map((row) => ruleFor(row.id))
    .join('')
}
