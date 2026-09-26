import { isStyleSafeId, type LabelRow } from './label-rows'

/** The `id` of the radio that selects one group, and the `for` of the chip that labels it. */
export const groupRadioId = (labelId: string): string => `mp-group-${labelId}`

/** The `id` of the radio that selects nothing, which is the state a plan is first drawn in. */
export const ALL_RADIO_ID = 'mp-group-all'

/** The `name` the radios share, so choosing one group unchooses the last. */
export const GROUP_RADIO_NAME = 'plan-group'

/** How much of a feature is left visible when a different group is chosen. */
export const DIMMED_OPACITY = '0.12'

const ROOT = '[data-slot="plan-root"]'

const ruleFor = (labelId: string): string =>
  `${ROOT}:has(#${groupRadioId(labelId)}:checked) [data-label-id]:not([data-label-id="${labelId}"])` +
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
