import { z } from 'zod'
import { EntityId, EntityName } from './document.js'
import { IsoDate, PlanItem, PlanManifest, Timezone } from './plan.js'
import { ScheduleView } from './schedule-view.js'

/**
 * A plan and the schedule derived from it, which is never stored (spec §3.4).
 *
 * `shareLinks` is **optional** because an admin-only block a caller is refused is absent rather
 * than empty (ADR 0013): one handler serves an admin and a link holder, so a plan handed to a link
 * principal must not carry a field only an admin may see — and an empty array would not do, since
 * it states that a plan has no seats, which is a different sentence from "you were not told".
 */
export const PlanView = PlanManifest.extend({
  epics: PlanManifest.shape.epics.readonly(),
  features: PlanManifest.shape.features.readonly(),
  items: PlanManifest.shape.items.readonly(),
  shareLinks: PlanManifest.shape.shareLinks.readonly().optional(),
  schedule: ScheduleView,
}).meta({ id: 'PlanView', description: 'A plan, and the schedule computed from it' })

/**
 * A plan as a list describes it: its settings and three counts, never its contents.
 *
 * At this product's own bounds that is 200 plans carrying up to 2,000 items each — 400,000 items
 * on the one screen that renders none of them. `shareLinkCount` is optional for the reason
 * `PlanView.shareLinks` is: present exactly when a caller may see share links at all, so an
 * unconditional count would tell a link principal how many seats exist on a plan it cannot
 * otherwise read.
 */
export const PlanListItem = z
  .object({
    id: EntityId,
    name: EntityName,
    startDate: IsoDate,
    sprintLengthDays: PlanManifest.shape.sprintLengthDays,
    timezone: Timezone,
    epicCount: z.number().int().min(0),
    featureCount: z.number().int().min(0),
    itemCount: z.number().int().min(0),
    shareLinkCount: z.number().int().min(0).optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ id: 'PlanListItem', description: 'A plan as a list row describes it: settings and counts, no contents' })

/** Every plan a caller may be told about, most recently updated first. */
export const PlanList = z
  .object({ plans: z.array(PlanListItem).readonly() })
  .meta({ id: 'PlanList', description: 'The plans of one product' })

/** One item with the description its own file holds. */
export const ItemView = PlanItem.extend({ description: z.string() }).meta({
  id: 'ItemView',
  description: "One item, its description included",
})
