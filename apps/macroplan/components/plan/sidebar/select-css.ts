import { isStyleSafeId } from '../labels/label-rows'
import { PLAN_ROOT } from '../shell/shell-css'
import type { SidebarRail } from './sidebar-rows'

/** The `id` of the radio that selects one rail, and the `for` of the row that names it. */
export const railRadioId = (epicId: string): string => `mp-sel-rail-${epicId}`

/** The `id` of the radio that selects one feature. */
export const featureRadioId = (featureId: string): string => `mp-sel-feature-${featureId}`

/** The `id` of the radio that selects nothing, which is the state a plan is first drawn in. */
export const NOTHING_SELECTED_ID = 'mp-sel-none'

/** The `name` every selection radio shares, so choosing one unchooses the last. */
export const SELECT_RADIO_NAME = 'plan-selection'

/** How much of an unselected mark is left visible. */
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
  `${ROOT}:has(#${railRadioId(epicId)}:checked) [data-slot="rail"]:not([data-epic-id="${epicId}"])` +
  `{opacity:${SELECT_DIMMED}}`

const featureRule = (featureId: string): string =>
  `${ROOT}:has(#${featureRadioId(featureId)}:checked) [data-feature-id]:not([data-feature-id="${featureId}"])` +
  `{opacity:${SELECT_DIMMED}}`

const arcRule = (featureId: string): string =>
  `${ROOT}:has(#${featureRadioId(featureId)}:checked) ` +
  `[data-slot="arc"]:not([data-arc-from="${featureId}"]):not([data-arc-to="${featureId}"])` +
  `{opacity:${SELECT_DIMMED}}`

/**
 * One CSS rule per rail and two per feature: choosing one in the sidebar dims the rest of the graph.
 *
 * ### The same mechanism as a group, deliberately
 *
 * `labels/group-css.ts` holds the whole argument and none of it is restated here: a class cannot be chosen
 * by a runtime value because Tailwind's scanner reads class names as text; an inline style cannot do it
 * either, because what has to change is the appearance of *other* elements than the one clicked; and
 * `:has()` on the common ancestor is what lets a control in one subtree reach marks in another. Selecting a
 * rail and selecting a group are the same gesture over a different attribute, so they are the same
 * mechanism rather than a second one — which is also why they share {@link PLAN_ROOT} and why choosing
 * a rail re-renders nothing. That constant is the shell's own slot, imported rather than written again:
 * both sheets used to spell it `plan-root`, which nothing had rendered since the frame of ADR 0068, so
 * every rule in both anchored on an element that did not exist and no selection dimmed anything.
 *
 * ### A rail dims by its whole group, a feature by the marks
 *
 * A rail selection dims `[data-slot="rail"]`, so the other rails go faint **including their names** — a
 * rail is a lane and the point of selecting one is to read it against the quarter bands without four others
 * crossing it. A feature selection dims `[data-feature-id]` instead, which is bar-by-bar and reaches the
 * selected feature's own rail: the neighbours on its lane are what it is being compared against.
 *
 * ### Arcs are dimmed only by a feature, and only if they touch neither end
 *
 * A dependency belongs to two features, so the honest test is whether the selected one is either end —
 * `:not([data-arc-from])` and `:not([data-arc-to])` together. That is what makes selecting a feature answer
 * "what does this wait on, and what waits on it" without a second view.
 *
 * A **rail** selection leaves every arc alone. CSS cannot ask whether an arc's far end is on the chosen
 * rail — the arc carries two feature ids and not their rails — so the choice is between dimming all of them
 * and dimming none. None is right: an arc into a faint rail still shows the coupling, and dimming the lot
 * would hide the one thing design §3.1 says makes this a git graph.
 *
 * An id that is not ULID-shaped is skipped rather than escaped, for {@link isStyleSafeId}'s reason: it
 * cannot occur, since every id here came out of a `PlanView` decode, and a stylesheet is the wrong place to
 * be clever about a value that should not exist. That guard is imported from the group's module rather than
 * written again, so there is one answer to which ids are safe to interpolate.
 */
export function selectCss(rails: readonly SidebarRail[]): string {
  const railRules = rails.filter((rail) => isStyleSafeId(rail.id)).map((rail) => railRule(rail.id))
  const featureRules = rails.flatMap((rail) =>
    rail.features
      .filter((feature) => isStyleSafeId(feature.id))
      .flatMap((feature) => [featureRule(feature.id), arcRule(feature.id)]),
  )
  return [...railRules, ...featureRules].join('')
}
