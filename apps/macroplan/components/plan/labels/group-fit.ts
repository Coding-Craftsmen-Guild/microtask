import type { Rung } from '@repo/canvas'
import { fitFor, openingZoom } from '../canvas/zoom-view'
import type { PlanScreenModel } from '../plan-screen-model'

/** Where the timeline goes when one group's chip is chosen. */
export interface GroupFit {
  /** The stop to draw at: the finest one that puts the whole group inside the pane. */
  readonly rung: Rung

  /** The group's own first working day, which is what lands at the left edge. */
  readonly day: number
}

interface Reach {
  readonly from: number
  readonly to: number
}

const widened = (was: Reach | undefined, span: { startDay: number; endDay: number }): Reach => ({
  from: was === undefined ? span.startDay : Math.min(was.from, span.startDay),
  to: was === undefined ? span.endDay : Math.max(was.to, span.endDay),
})

/**
 * How far each group reaches, keyed by label id; a group with nothing placed is **absent**.
 *
 * One pass over the features and one map of spans, rather than a scan per group: a plan holds up to
 * `LIMITS.featuresPerPlan` features and the chips are rendered on every plan, so this runs on a page
 * that already derives a schedule.
 *
 * A feature the forward pass could not place has no span and so widens nothing. That is what makes a
 * group of entirely unplaced work absent rather than present with a zero-length window: there is no
 * window, and `groupFits` says so by leaving the key out.
 */
export function groupReach(plan: PlanScreenModel): ReadonlyMap<string, Reach> {
  const spans = new Map(plan.schedule.spans.map((span) => [span.id, span]))
  const reach = new Map<string, Reach>()
  for (const feature of plan.features) {
    const span = spans.get(feature.id)
    if (feature.labelId === null || span === undefined) continue
    reach.set(feature.labelId, widened(reach.get(feature.labelId), span))
  }
  return reach
}

/**
 * Where the view goes for each group, keyed by label id; a group with nothing placed is absent.
 *
 * ### Why the answer is computed on the server
 *
 * Because the chip carries it as an attribute, and the root that reads it is a client component under
 * `components/plan` — which may be handed primitives, unbound functions, `null` and markup on
 * `children`, and nothing else (`../module-boundaries.test.tsx`). A map of groups is none of those.
 * So the decision is made where the plan is, written onto the chip as two values, and read back off
 * the markup by `closest()`: the same shape `data-detail` and `data-hover-id` already have, and for
 * the same reason.
 *
 * It also keeps the arithmetic testable without a browser. What is left on the client is reading two
 * attributes and setting `scrollLeft`.
 *
 * ### What a chip does with it
 *
 * `canvas/use-group-fit.ts` sets the zoom to {@link GroupFit.rung} and scrolls {@link GroupFit.day} to
 * the left edge. Selecting the group — the dimming — is untouched and still costs no JavaScript at
 * all: the chip is a `<label>` for a radio, and nothing here calls `preventDefault`.
 *
 * ### Why a group with nothing placed is absent rather than fitted to day zero
 *
 * Clicking such a chip then selects without moving the view, which is the only honest answer. A group
 * holding no features, or holding only features the pass could not place, has no window — and sending
 * a reader to day zero would look like the plan jumping for no reason they could see.
 */
export function groupFits(plan: PlanScreenModel): ReadonlyMap<string, GroupFit> {
  return new Map(
    [...groupReach(plan)].map(([labelId, reach]) => [
      labelId,
      { rung: fitFor(reach.to - reach.from), day: reach.from },
    ]),
  )
}

/**
 * Where the view goes when **All work** is chosen: back to the fit the plan opens at, at day zero.
 *
 * Choosing a group narrows the view to it, so clearing the choice has to widen it again — otherwise a
 * reader who looked at a two-week phase and then asked for everything would be left at the Sprint stop
 * scrolled into the middle of their plan, looking at a fortnight of a year's work with no sign that
 * anything had been cleared.
 *
 * It is `openingZoom`, not whatever stop the reader was at before they picked a group. Remembering
 * that would mean holding state across a round trip to undo a gesture that is itself one click, and
 * the plan's own fit is the answer a reader asking for the whole plan wanted anyway.
 */
export const allWorkFit = (plan: PlanScreenModel): GroupFit => ({ rung: openingZoom(plan), day: 0 })
