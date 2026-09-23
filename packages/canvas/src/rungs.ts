import { SPRINTS_PER_QUARTER } from './bands.js'
import type { PlanScale } from './scale.js'

const REFERENCE_WIDTH_PX = 900

const SPRINT_DAYS = 10

const ITEM_RUNG_SPRINTS = 2

/**
 * Which of §5's three detail levels a canvas is drawing at.
 *
 * Spec §5 (`docs/superpowers/specs/2026-09-22-macroplan-design.md`): "Detail level is **derived
 * from the time scale**, not controlled separately. Fusing the two into one gesture was the
 * original proposal and produces unpredictable re-layout; splitting them into two controls asks the
 * user to maintain a combination that is only ever wrong."
 *
 * So this is an *answer*, never an input. {@link rungFor} is the only way to obtain one, there is no
 * rung prop anywhere in the product, and nothing accepts a rung a caller chose: a component that
 * took one could be handed `'item'` at a scale where an item bar is a third of a pixel wide, and
 * the two controls §5 refuses would be back with one of them hidden inside a prop.
 *
 * `'epic'` draws epic rails, feature nodes, dependency arcs and milestone diamonds; `'feature'`
 * draws feature bars sized by estimate with items inside where they fit; `'item'` draws item bars
 * with labels and the linked Microtask task. Those are §5's own three rows, in its own order.
 */
export type Rung = 'epic' | 'feature' | 'item'

/**
 * The px-per-working-day at which the canvas reaches the feature rung, and below which it is at the
 * epic rung.
 *
 * ### Where the number comes from
 *
 * §5's table measures rungs in **time visible on screen**, not in px per day — `~1–2 years` for
 * epic, `~1 quarter` for feature, `~1–2 sprints` for item — so a threshold on `pxPerDay` is that
 * table divided by a width. The width is 900px, and it is not a guess: `@repo/ui`'s `Page` caps
 * every page body at `max-w-[900px]`, and Macroplan's own admin layout wraps its children in that
 * `Page`. It is the width a canvas actually gets in this product.
 *
 * A quarter is {@link SPRINTS_PER_QUARTER} sprints — imported rather than written again here, so
 * this threshold and a quarter band cannot disagree about what a quarter is — against the default
 * `sprintLengthDays` of 10 (`macroplan-domain`'s `DEFAULT_SPRINT_LENGTH_DAYS`), which is the one
 * assumption this file makes that `bands.ts` does not have to: `rungFor` is a function of the scale
 * alone and is handed no `PlanCalendar`, so it cannot read a plan's real sprint length. Six ten-day
 * sprints are 60 working days, and `900 / 60 = 15`. Note that 60 working days is deliberately *not*
 * three calendar months (about 65 working days): it is `bands.ts`'s quarter, counted in sprints
 * from the plan's own start, because a rung boundary that meant a calendar quarter while the bands
 * beside it meant six sprints would be two different quarters on one screen.
 *
 * ### Why the gutter is not subtracted
 *
 * `PlanScale` carries a `gutter` and this ignores it, though the axis proper is narrower than 900px
 * by exactly that inset. Deliberate: widening a rail label is a chrome decision, and a rung that
 * moved when someone did it would re-layout the whole canvas — the unpredictable re-layout §5 is
 * arguing against — for a reason no user could connect to what they changed.
 */
export const FEATURE_RUNG_MIN_PX_PER_DAY = REFERENCE_WIDTH_PX / (SPRINTS_PER_QUARTER * SPRINT_DAYS)

/**
 * The px-per-working-day at which the canvas reaches the item rung.
 *
 * §5's item row is `~1–2 sprints`, and the **wider** end of a row is what bounds it: the row names
 * the widest view still served at that rung, so two sprints visible is the item rung and anything
 * wider has left it. Two ten-day sprints are 20 working days, and `900 / 20 = 45`. Read
 * {@link FEATURE_RUNG_MIN_PX_PER_DAY} for where the 900 and the ten-day sprint come from.
 */
export const ITEM_RUNG_MIN_PX_PER_DAY = REFERENCE_WIDTH_PX / (ITEM_RUNG_SPRINTS * SPRINT_DAYS)

/**
 * The rung a scale is at: §5's detail level, derived and never passed in.
 *
 * Pure arithmetic on `pxPerDay`, and **total** — every positive `pxPerDay` answers one of the three
 * rungs, because the last branch is unconditional. No zoom level renders nothing, which is the
 * property that makes it safe for the canvas to have no rung of its own to fall back on.
 *
 * Both thresholds are **inclusive at their lower end**: exactly
 * {@link ITEM_RUNG_MIN_PX_PER_DAY} is the item rung, and exactly
 * {@link FEATURE_RUNG_MIN_PX_PER_DAY} is the feature rung. That is what puts each of §5's three
 * rows on the rung §5 names it for: two sprints visible lands on `'item'`, one quarter lands on
 * `'feature'`, and a year — `900 / 260` working days, about 3.5px per day — lands well inside
 * `'epic'`, as do two years at about 1.7.
 *
 * The comparison is written as a multiplication rather than as `REFERENCE_WIDTH_PX / pxPerDay`, so
 * a whole-number `pxPerDay` is compared in exact integer arithmetic. `scale.ts` already argues that
 * a fractional `pxPerDay` makes `xToDay` name the wrong day; a boundary decided by a float division
 * would be the same class of quiet error, one rung wide.
 *
 * ### The band between a quarter and a year
 *
 * §5 names three views and leaves the stretches between them unassigned — nothing in the table
 * says which rung shows five months. Everything wider than a quarter is the epic rung here, which
 * follows from reading each row as the widest view it serves rather than as a midpoint to round to.
 * The alternative, snapping to the nearest named view, would put a four-month view on the feature
 * rung with feature bars a few px wide, and would need two more numbers §5 never gives.
 */
export function rungFor(scale: PlanScale): Rung {
  if (scale.pxPerDay * ITEM_RUNG_SPRINTS * SPRINT_DAYS >= REFERENCE_WIDTH_PX) return 'item'
  if (scale.pxPerDay * SPRINTS_PER_QUARTER * SPRINT_DAYS >= REFERENCE_WIDTH_PX) return 'feature'
  return 'epic'
}
