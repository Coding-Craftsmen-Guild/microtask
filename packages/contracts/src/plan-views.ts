import { z } from 'zod'
import { EpicBindingView } from './bridge.js'
import { EntityId, EntityName } from './document.js'
import { LIMITS } from './limits.js'
import { Role } from './share-link.js'
import { IsoDate, PlanEpic, PlanItem, PlanManifest, Timezone } from './plan.js'
import { ScheduleView } from './schedule-view.js'

/**
 * One epic as a plan **response** carries it, which is not how storage carries it.
 *
 * The difference is one field and one credential: `PlanEpic` in `plan.ts` holds
 * `binding.sealedToken`, because a manifest that stores a binding has to keep the token it was bound
 * with; this schema's `binding` is {@link EpicBindingView}, which has no key for a token at all
 * (design §7.2: the token never leaves the server, with no caller excepted). A schema with nowhere to
 * put it is what makes that true by construction, and zod strips the key off any body built from a
 * stored binding by hand.
 *
 * `binding` is optional **and** nullable, and the three states are three different sentences. Absent
 * is "you were not told": `epic:bind` is in the kernel's `ADMIN_ONLY_ACTIONS`, so a link holder is
 * refused the block, and a refused block is absent rather than empty (ADR 0013), for the reason
 * `shareLinks` below is. `null` is "this rail is bound to nothing", which is a fact about the plan and
 * not about the reader, and an admin — never refused — is the only caller that sees it. A value is the
 * binding. Collapsing absent into `null` would tell a `view` holder that every rail is unbound, which
 * is false whenever one is bound, and `@repo/macroplan-domain`'s `planView` is where the three are
 * decided per caller.
 */
export const PlanEpicView = PlanEpic.extend({
  binding: EpicBindingView.nullable().optional(),
}).meta({ id: 'PlanEpicView', description: 'A rail as a response carries it: its binding, never its token' })

/**
 * A plan and the schedule derived from it, which is never stored (spec §3.4).
 *
 * `shareLinks` is **optional** because an admin-only block a caller is refused is absent rather
 * than empty (ADR 0013): one handler serves an admin and a link holder, so a plan handed to a link
 * principal must not carry a field only an admin may see — and an empty array would not do, since
 * it states that a plan has no seats, which is a different sentence from "you were not told".
 *
 * `epics` is {@link PlanEpicView} and not `PlanManifest`'s own epic, which is the difference between a
 * response and a record: this schema said `EpicBinding` — token included — until phase 4, so a route
 * answering the stored shape typechecked and the wire *required* the credential it was meant to
 * withhold. The cap travels with the override, since replacing the element type replaces the array.
 */
export const PlanView = PlanManifest.extend({
  epics: z.array(PlanEpicView).max(LIMITS.epicsPerPlan).readonly(),
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

/**
 * What the plan seat that asked holds: the answer `GET /v1/macroplan/shares/current` gives.
 *
 * It carries **no token**, its own included, for the reason `ShareView` carries none: the caller
 * sent its token to ask the question, so echoing it back tells nobody anything and only puts a live
 * credential into another response body — and having no token field at all is what makes "never
 * another seat's token" true by construction rather than by filtering (ADR 0033).
 *
 * `role` and `scope` are the two inputs `capabilities()` takes, and they are here rather than the
 * projection itself. ADR 0038 weighed serving the set, called it the cleanest option, and rejected
 * it on **reach** rather than on principle: the set is needed to render Server Components that have
 * made no bootstrap call, and threading it through every one of them makes the capability set a prop
 * on the whole tree. So no API response carries that record today and this route mirrors Microtask's
 * handler exactly — and the door stays open, the ADR itself holding the question worth revisiting
 * should `shares/current` become a hard dependency of every page anyway.
 *
 * `scope` is spelled inline rather than through a shared `PlanScope` schema, because a plan seat
 * stores no scope to validate — `PlanShareLink` has no such field, and the API derives this value
 * from the plan whose manifest the token was found in. Spec §7.1 defers an epic variant rather than
 * foreclosing it; should one arrive, a scope with a real choice to state earns a schema of its own.
 *
 * `plan` mirrors `ShareView`'s `project` block and stops there. A Microtask seat is told its
 * folders and tasks because a task scope reaches part of a project; a plan seat reaches the whole
 * plan, so the reachable tree is `GET /plans/{planId}` and repeating it here would be a second copy
 * of the largest response in the product.
 */
export const PlanShareView = z
  .object({
    role: Role,
    scope: z.object({ kind: z.literal('plan'), planId: EntityId }),
    plan: z.object({ id: EntityId, name: EntityName }),
  })
  .meta({ id: 'PlanShareView', description: 'What the plan seat that asked holds' })
