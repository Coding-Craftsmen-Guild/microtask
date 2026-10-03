import { isStyleSafeId } from '../labels/label-rows'
import { PLAN_ROOT, SELECTED_RAIL } from '../shell/shell-css'
import type { BoardRail } from './board-rows'

/** The `id` of the radio that selects one rail, and the `for` of the swatch that names it. */
export const railRadioId = (epicId: string): string => `mp-sel-rail-${epicId}`

/** The `id` of the radio that selects nothing, which is the state a plan is first drawn in. */
export const NOTHING_SELECTED_ID = 'mp-sel-none'

/** The `name` every selection radio shares, so choosing one unchooses the last. */
export const SELECT_RADIO_NAME = 'plan-selection'

/**
 * How faint the work that is *not* chosen goes.
 *
 * It was 0.12, and at twelve percent over a white card a coloured bar is indistinguishable from the
 * page: choosing a rail did not emphasise it, it blanked the plan. The point of the selection is to
 * read one thread **against** the rest, so the rest has to stay legible — the reference tools quiet
 * the unmatched to roughly a third rather than erasing them.
 */
export const SELECT_DIMMED = '0.32'

const ROOT = PLAN_ROOT

const railRule = (epicId: string): string =>
  `${ROOT}[${SELECTED_RAIL}="${epicId}"] [data-slot="rail"]:not([data-epic-id="${epicId}"])` +
  `{opacity:${SELECT_DIMMED}}`

const rowRule = (epicId: string): string =>
  `${ROOT}[${SELECTED_RAIL}="${epicId}"] [data-slot="rail-row"]:not([data-epic-id="${epicId}"])` +
  `{opacity:${SELECT_DIMMED}}`

/**
 * One pair of CSS rules per rail: choosing one dims every other lane, and every other name.
 *
 * ### The same mechanism as a group, deliberately
 *
 * `labels/group-css.ts` holds the whole argument and none of it is restated here: a class cannot be
 * chosen by a runtime value because Tailwind's scanner reads class names as text; an inline style
 * cannot do it either, because what has to change is the appearance of *other* elements than the one
 * clicked; and the question is asked of the common ancestor, the shell, which says which rail is chosen as
 * `data-sel-rail` (no longer `:has()` of the radio, which cost a restyle of the whole screen per hover at
 * the cap — ADR 0069). Selecting a rail and selecting a group are the same gesture over a different
 * attribute, so they are the same mechanism rather than a second one — which is also why they share
 * {@link PLAN_ROOT}, and why choosing a rail re-renders nothing but that attribute.
 *
 * ### The name dims with its lane, which it did not before
 *
 * The rule used to reach `[data-slot="rail"]`, the band in the SVG, and the names were in a pane the
 * selector never touched: choosing a rail quieted eight bands under eight equally bright names. They
 * are rows in the same scroller now, so the second rule is one line and the column finally says the
 * same thing the board does.
 *
 * ### What left with the tree
 *
 * Two rules per **feature**. They dimmed bar-by-bar and quieted every arc touching neither end of the
 * chosen feature, and the only control that checked them was a radio in the rail tree. The tree is
 * gone, so those rules had no way to be true — a generated rule whose radio nothing renders is the
 * exact defect `shell-css.ts` records this sheet already having shipped once. What answers that
 * question now is the pointer: `canvas/pointer-css.ts` lights a feature, its items and the arcs at
 * both ends of it, which is the same set, under a gesture that needs no click.
 *
 * An id that is not ULID-shaped is skipped rather than escaped, for {@link isStyleSafeId}'s reason:
 * it cannot occur, since every id here came out of a `PlanView` decode, and a stylesheet is the wrong
 * place to be clever about a value that should not exist.
 */
export function railSelectCss(rails: readonly BoardRail[]): string {
  return rails
    .filter((rail) => isStyleSafeId(rail.id))
    .flatMap((rail) => [railRule(rail.id), rowRule(rail.id)])
    .join('')
}
