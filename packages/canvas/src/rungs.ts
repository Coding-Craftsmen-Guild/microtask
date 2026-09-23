import { SPRINTS_PER_QUARTER } from './bands.js'
import type { DayRange } from './bands.js'

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
 * took one could be handed `'item'` at a view where an item bar is a third of a pixel wide, and the
 * two controls §5 refuses would be back with one of them hidden inside a prop.
 *
 * `'epic'` draws epic rails, feature nodes, dependency arcs and milestone diamonds; `'feature'`
 * draws feature bars sized by estimate with items inside where they fit; `'item'` draws item bars
 * with labels and the linked Microtask task. Those are §5's own three rows, in its own order.
 */
export type Rung = 'epic' | 'feature' | 'item'

/**
 * The widest view still on the item rung, in working days.
 *
 * §5's item row is `~1–2 sprints`, and the **wider** end of a row is what bounds it: a row names
 * the widest view still served at that rung, so two sprints visible is the item rung and anything
 * wider has left it. Two sprints at the default `sprintLengthDays` of 10 (`macroplan-domain`'s
 * `DEFAULT_SPRINT_LENGTH_DAYS`) are 20 working days.
 *
 * Ten is the one assumption this file makes that `bands.ts` does not have to. {@link rungFor} is
 * handed a {@link DayRange} and no `PlanCalendar`, so it cannot read a plan's real sprint length;
 * a plan on week-long sprints reaches the item rung at four of its sprints rather than two. That is
 * the price of a rung that is a function of the view alone, and it is the right price — a rung that
 * changed when someone retimed a plan would re-layout the canvas for a reason no one could see.
 */
export const ITEM_RUNG_MAX_DAYS = ITEM_RUNG_SPRINTS * SPRINT_DAYS

/**
 * The widest view still on the feature rung, in working days; wider than this is the epic rung.
 *
 * §5's feature row is `~1 quarter`. A quarter is {@link SPRINTS_PER_QUARTER} sprints — imported
 * rather than written again here, so this boundary and a quarter band cannot disagree about what a
 * quarter is — which at ten working days a sprint is 60 working days. Deliberately *not* three
 * calendar months, about 65 working days: a rung boundary that meant a calendar quarter while the
 * bands beside it meant six sprints would be two different quarters on one screen.
 */
export const FEATURE_RUNG_MAX_DAYS = SPRINTS_PER_QUARTER * SPRINT_DAYS

/**
 * The rung a viewport is at: §5's detail level, derived from the view and never passed in.
 *
 * ### Which range each rung wants
 *
 * A caller chooses its rung by choosing its range, so this is the table to read before picking one.
 * **A range of at most {@link ITEM_RUNG_MAX_DAYS} (20) working days is `'item'`; wider, up to and
 * including {@link FEATURE_RUNG_MAX_DAYS} (60), is `'feature'`; anything wider than 60 is
 * `'epic'`.** So `{ fromDay: 0, toDay: 20 }` is the widest item-rung viewport, `{ fromDay: 0,
 * toDay: 60 }` the widest feature-rung one, and `{ fromDay: 0, toDay: 61 }` the narrowest epic-rung
 * one. A screen or a test that means to draw **feature bars** must pass a range wider than 20 and
 * no wider than 60 — a quarter, `{ fromDay: 0, toDay: 60 }`, is the obvious choice — because a
 * canvas gated on this rung draws rails, nodes and arcs and **no bars at all** at the epic rung,
 * and a plan's whole span is almost always epic.
 *
 * ### Why a range rather than a `PlanScale`
 *
 * §5 specifies rungs as *time visible on screen* — `~1–2 years`, `~1 quarter`, `~1–2 sprints` — and
 * time on screen is a width divided by a `pxPerDay`, not a `pxPerDay`. A rung derived from the scale
 * alone would have to assume a canvas width, and would then be wrong on every canvas of a different
 * width: at 45px per day a 900px canvas shows two sprints and a 1600px canvas shows three and a
 * half, which are two different rows of §5's table. `bands.ts` already made this decision for every
 * other chrome function in the package — a viewport was left off `PlanScale` on purpose "so every
 * chrome function here is told its range explicitly rather than guessing one from a px width" — and
 * this is a chrome function. `quarterBands`, `sprintTicks` and `todayLine` all demand a
 * {@link DayRange}, so every caller already holds one and nothing is added to a call site.
 *
 * It also leaves nothing to get stale. There is no width constant here to be falsified by a layout
 * change, and no gutter to subtract: a `DayRange` is working-day offsets and never had one, so
 * widening a rail label cannot move the rung.
 *
 * ### Totality, and a range showing nothing
 *
 * Pure arithmetic on `toDay - fromDay`, and **total** — the last branch is unconditional, so every
 * range answers one of the three rungs and no viewport renders nothing. Both bounds sit on whole
 * days and both are inclusive at the narrow end, so each boundary is decided by an integer
 * comparison from either side.
 *
 * A degenerate range — `toDay <= fromDay`, zero days or inverted, which `bands.ts` answers with no
 * bands and no ticks — answers `'item'`. That falls out of the arithmetic rather than being special
 * cased, and it is the right way round: the rung is monotone in the width of the view, so the
 * narrowest possible view gets the finest rung with no discontinuity at zero. It is also
 * unobservable, because a viewport showing no working days has nothing in it to draw at any rung.
 */
export function rungFor(range: DayRange): Rung {
  const days = range.toDay - range.fromDay
  if (days <= ITEM_RUNG_MAX_DAYS) return 'item'
  if (days <= FEATURE_RUNG_MAX_DAYS) return 'feature'
  return 'epic'
}
