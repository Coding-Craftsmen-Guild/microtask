import { notFound } from 'next/navigation'
import { DrawerPanel } from '../../../../../components/plan/drawer/drawer-panel'
import { drawerSubject } from '../../../../../components/plan/drawer/subject'
import { attentionOf } from '../../../../../components/plan/attention/attention'
import { AttentionCallout } from '../../../../../components/plan/attention/attention-mark'
import { seatPlanActions } from '../../../../../components/plan/seat-actions'
import { planCapabilities } from '../../../../../lib/plan-capabilities'
import { linkPath } from '../../../../../lib/routes'
import { readSeatPlan, readShare } from '../../read-share'

/** Props for {@link SeatFeatureDrawerPage}. */
export interface SeatFeatureDrawerPageProps {
  /** `token` and `featureId` from `/s/[token]/f/[featureId]`, both untrusted. */
  readonly params: Promise<{ readonly token: string; readonly featureId: string }>
}

/**
 * `/s/<token>/f/<featureId>`: one feature, open in the drawer slot beside the plan its token opens.
 *
 * The seat twin of `(admin)/plans/[planId]/f/[featureId]/page.tsx`, and every argument that page makes holds
 * here with one word changed — which credential the reads and the writes carry.
 *
 * ### Two reads, both the layout's
 *
 * `readShare` is `cache()`d on the token and `readSeatPlan` on the token and the plan id, so on a cold load
 * this page and `layout.tsx` share both calls, and on a soft navigation — the layout not re-rendering at all
 * — these are the only reads of the request. That sharing is the whole reason the plan screen moved into the
 * layout: while it was rendered from `page.tsx` there was nowhere a drawer segment could sit that did not
 * rebuild 2,200 table rows and 2,000 SVG nodes to open one panel (ADR 0057).
 *
 * The plan id is **not** in this URL and is not taken from one. It comes from `readShare`, which is the API's
 * own answer about what this token is rooted in — so a seat cannot be sent to a feature of another plan by a
 * hand-edited address, because there is no field in the address to edit.
 *
 * ### The subject, and what a missing one means
 *
 * `drawerSubject` is one lookup answering both shapes the panel needs, through `tableRows` — so the drawer
 * and the table cannot word one feature two ways while rendering side by side, and the rows are `cache()`d
 * on the plan object the read already cached.
 *
 * A `featureId` no row answers to is `notFound()` and never an empty panel: the read answered the whole plan,
 * so an id absent from it is a stale link rather than something still loading. An **item** id in this segment
 * is `notFound()` too, the kind being checked, so the two segments cannot answer for each other. The boundary
 * it lands on is the surface's own `not-found.tsx`.
 *
 * ### Authority
 *
 * The controls are this seat's, from `planCapabilities`, and the writes are `seatPlanActions(token)` — the
 * same twenty-eight the admin surface hands over, with this seat's token bound in. Neither is a gate: the
 * API decides, and a field whose write it refuses says so under the field. A `view` seat reaches this page
 * and is drawn no editable field at all, which is the correct outcome rather than a refusal.
 *
 * `description` is `null` and there is no second read behind it: a description belongs to an **item's** own
 * file, and there is no `describeFeature` among the plan writes.
 *
 * A refused read returns **nothing at all**. The layout met the same refusal from the same cached reads and
 * says it once, in place of the timeline; a sentence here would be a duplicate.
 */
export default async function SeatFeatureDrawerPage({ params }: SeatFeatureDrawerPageProps) {
  const { token, featureId } = await params
  const share = await readShare(token)
  if (!share.ok) return null
  const plan = await readSeatPlan(token, share.value.scope.planId)
  if (!plan.ok) return null
  const subject = drawerSubject(plan.value, 'feature', featureId)
  if (subject === undefined) notFound()
  return (
    <DrawerPanel
      actions={seatPlanActions(token)}
      attention={<AttentionCallout on={attentionOf(plan.value).get(subject.row.id)} />}
      closeHref={linkPath(token)}
      controls={planCapabilities(share.value.role, share.value.scope).content}
      description={null}
      link={null}
      planId={plan.value.id}
      row={subject.row}
      values={subject.values}
    />
  )
}
