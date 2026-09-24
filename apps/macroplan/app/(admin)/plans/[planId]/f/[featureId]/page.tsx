import { notFound } from 'next/navigation'
import { ADMIN_PLAN_ACTIONS } from '../../../../../../components/plan/admin-actions'
import { DrawerPanel } from '../../../../../../components/plan/drawer/drawer-panel'
import { drawerSubject } from '../../../../../../components/plan/drawer/subject'
import { ADMIN_CONTROLS } from '../../../../../../lib/admin-controls'
import { planPath } from '../../../../../../lib/routes'
import { readPlan } from '../../read-plan'

/** Props for {@link FeatureDrawerPage}. */
export interface FeatureDrawerPageProps {
  /** `planId` and `featureId` from `/plans/[planId]/f/[featureId]`, both untrusted. */
  readonly params: Promise<{ readonly planId: string; readonly featureId: string }>
}

/**
 * `/plans/<planId>/f/<featureId>`: one feature, open in the drawer slot beside its own plan.
 *
 * ### One read, and it is the layout's
 *
 * `readPlan(planId)` is `cache()`d on exactly that argument, so on a cold load this and
 * `layout.tsx` share one `plans.read()` between them, and on a soft navigation — the layout not
 * re-rendering at all — this is the only read of the request. Nothing is threaded down from the
 * layout because a layout cannot hand its children a prop; the cache is what takes its place, and
 * it only works while both ask with the same key. That is also why an expired admin is sent back to
 * `/login?next=/plans/<id>` rather than to this drawer: the pathname inside `readPlan` is the plan's,
 * because a per-drawer pathname would be a second cache key and so a second read of the largest
 * response in the product.
 *
 * ### The subject is resolved through the table's own rows
 *
 * `drawerSubject` is one lookup of the plan answering both shapes the panel needs — the row
 * `tableRows` worded, and the raw name and estimate a field edits — so the two cannot name two
 * records, and neither is derived from the other (`components/plan/drawer/subject.ts`). What follows
 * is about the row half, which is the existence check.
 *
 * `tableRows` is where a feature's epic, estimate and sprint are already worded (§3.2 and §5, in
 * `components/plan/table/rows.ts`), so finding this feature's row is both the existence check and
 * every string the panel draws — and the drawer cannot disagree with the table about a plan they are
 * rendering side by side. The lookup is complete for a feature: `railsOf` gives a feature whose
 * `epicId` names no epic "a rail of its own, ordered after every real one" (`@repo/schedule`), so
 * every feature the plan holds has exactly one row, and the drawer names the unclaimed rail the
 * canvas draws rather than refusing the feature.
 *
 * The rows are shared the same way the read is: `tableRows` is `cache()`d on the plan object, and the
 * plan object is the one `readPlan` cached, so finding one row here does not rebuild the 2,200 the
 * table beside it is drawing — the one read of a soft navigation is also the one derivation of it
 * (`components/plan/table/rows.ts`).
 *
 * A `featureId` no row answers to is `notFound()` and never an empty panel: the read answered the
 * whole plan, so an id absent from it is a stale link and not a thing still loading. That is the
 * idiom `missingIsNotFound` applies to the API's own 404s (`packages/app-session/src/action-result.ts`)
 * — this is the same answer for an absence the app can see for itself, and `notFound()` is called
 * directly for it as `apps/microtask`'s share-scope check does, there being no `ActionResult` to
 * carry. The boundary it lands on is `[planId]/not-found.tsx`, which renders inside the layout, so
 * the plan stays on screen.
 *
 * An `itemId` in this segment is therefore also `notFound()`: the row it finds is an item's, the kind
 * is checked, and the two segments cannot answer for each other.
 *
 * ### What it hands down about authority, and what it does not
 *
 * {@link ADMIN_CONTROLS}`.content` and {@link ADMIN_PLAN_ACTIONS}, which is the same pair the layout
 * hands `PlanScreen` — imported here rather than threaded, because a layout cannot hand its children a
 * prop and this page is a child rather than a part of that screen. The controls are the **content**
 * half alone: a drawer asks nothing about seats, so `PlanSeatControls` cannot be reached from here at
 * all (`lib/plan-capabilities.ts`). Neither is a gate: the admin's authority is the API's answer to
 * `mp_admin`, and a field whose write it refuses says so under the field.
 *
 * `description` is `null` and there is no second read behind it. A description belongs to an **item's**
 * own file — `PlanManifest` is "everything about a plan except its item descriptions" — and there is no
 * `describeFeature` among the eighteen writes, so a feature has no such text for this page to read or a
 * box to draw.
 *
 * A refused read returns **nothing at all** rather than a second sentence. The layout met the same
 * refusal from the same cached read and says it once, in place of the timeline, and it renders no slot
 * when it does — so a sentence here would be either a duplicate or unreachable, and drawing a panel
 * from a plan nobody was allowed to read is not on the table.
 */
export default async function FeatureDrawerPage({ params }: FeatureDrawerPageProps) {
  const { planId, featureId } = await params
  const loaded = await readPlan(planId)
  if (!loaded.ok) return null
  const subject = drawerSubject(loaded.value, 'feature', featureId)
  if (subject === undefined) notFound()
  return (
    <DrawerPanel
      actions={ADMIN_PLAN_ACTIONS}
      closeHref={planPath(planId)}
      controls={ADMIN_CONTROLS.content}
      description={null}
      planId={planId}
      row={subject.row}
      values={subject.values}
    />
  )
}
