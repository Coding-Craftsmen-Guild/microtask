import { itemsByFeature } from '@repo/schedule'
import type { ScheduleItem } from '@repo/schedule'
import { spansById } from './plan.js'
import type { CanvasPlan, CanvasSchedule, CanvasSpan } from './plan.js'
import { dayToX, widthOfDays } from './scale.js'
import type { PlanScale } from './scale.js'

/**
 * One placed item as a mark: the id it draws for, the feature it flows under, the days it covers,
 * and where those land in px.
 *
 * `featureId` is carried alongside the geometry, not left for a caller to re-derive, so a mark can
 * be matched to the {@link FeatureBar} it nests under, or grouped into a table row, without a second
 * pass over the plan. `startDay` and `endDay` are carried for the same reason `FeatureBar` carries
 * them: so a hover can name the days a mark covers without going back to the spans array.
 *
 * `width` is `endDay - startDay`, with **no `+ 1`**, matching `FeatureBar`. A zero-day item —
 * `startDay === endDay` — gets a real mark at zero width rather than special treatment: it is a
 * placed item that takes no time, which is a different sentence from an item the pass never placed
 * at all, and that second case already has its own answer, which is no mark.
 */
export interface ItemMark {
  readonly id: string

  readonly featureId: string

  readonly startDay: number

  /** Exclusive: the first working-day offset **not** covered by this mark. */
  readonly endDay: number

  readonly x: number

  readonly width: number
}

interface MarkContext {
  readonly spans: ReadonlyMap<string, CanvasSpan>
  readonly scale: PlanScale
}

function markOf(item: ScheduleItem, context: MarkContext): ItemMark | null {
  const span = context.spans.get(item.id)
  if (span === undefined) return null
  return {
    id: item.id,
    featureId: item.featureId,
    startDay: span.startDay,
    endDay: span.endDay,
    x: dayToX(span.startDay, context.scale),
    width: widthOfDays(span.endDay - span.startDay, context.scale),
  }
}

/**
 * Every placed item as a mark, in the exact `(position, id)` order `itemsByFeature` already sorted
 * each feature's items into.
 *
 * Spans are read from the **wire** schedule, where feature ids and item ids share one array with
 * nothing to tell them apart. This walks `itemsByFeature(plan)` from `@repo/schedule` and asks
 * {@link spansById} for each **item's own id**, so a feature's span is never a candidate for an item
 * mark in the first place — the mirror of how `railLayout` asks only for a feature's own id. The
 * span map is built once here, the same one `railLayout` builds, and threaded through every item.
 *
 * An item whose `featureId` names no feature in the plan is never scheduled — the forward pass
 * documents that such an item "has no anchor to flow from and appears in neither `days` nor
 * `unscheduled`" — so it is absent from the wire schedule's spans and this produces no mark for it.
 * Nothing here checks `featureId` against the plan's features to reach that answer; the lookup
 * simply fails the same way a feature's own missing span does.
 *
 * The return is a flat array rather than one group per feature, because grouping by `featureId`
 * would have to invent a group for exactly the case above — an id that names no real feature — and
 * a group that can only ever be empty is not a group worth returning. A caller that wants an item's
 * feature already has it on the mark itself.
 *
 * Nothing here is written to; neither argument is mutated.
 */
export function itemsToMarks(
  plan: CanvasPlan,
  schedule: CanvasSchedule,
  scale: PlanScale,
): readonly ItemMark[] {
  const context: MarkContext = { spans: spansById(schedule), scale }
  return [...itemsByFeature(plan).values()].flatMap((items) =>
    items.flatMap((item) => markOf(item, context) ?? []),
  )
}
