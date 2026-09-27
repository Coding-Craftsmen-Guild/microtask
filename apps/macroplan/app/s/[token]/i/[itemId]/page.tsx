import { notFound } from 'next/navigation'
import { itemLink } from '../../../../../components/plan/bridge/item-link'
import { DrawerPanel } from '../../../../../components/plan/drawer/drawer-panel'
import { LinkField } from '../../../../../components/plan/drawer/link-field'
import { drawerSubject } from '../../../../../components/plan/drawer/subject'
import { seatPlanActions } from '../../../../../components/plan/seat-actions'
import { planCapabilities } from '../../../../../lib/plan-capabilities'
import { linkPath } from '../../../../../lib/routes'
import { readSeatBridge, readSeatDescription } from '../../read-seat-item'
import { readSeatPlan, readShare } from '../../read-share'

/** Props for {@link SeatItemDrawerPage}. */
export interface SeatItemDrawerPageProps {
  /** `token` and `itemId` from `/s/[token]/i/[itemId]`, both untrusted. */
  readonly params: Promise<{ readonly token: string; readonly itemId: string }>
}

/**
 * `/s/<token>/i/<itemId>`: one item, open in the drawer slot beside the plan its token opens.
 *
 * The seat twin of `(admin)/plans/[planId]/i/[itemId]/page.tsx`. Every argument that page makes holds here
 * with one word changed — which credential each read and each write carries — **except one**, and it is the
 * task picker.
 *
 * ### Why this page reads no task list, where its admin twin does
 *
 * There is no `readBoundTasks` here, so `options` is empty and the field draws no picker. That is design
 * §7.3 rather than an omission: it grants an effective `write` holder "the linked task's name", meaning the
 * one task linked, and the route that lists **every** task in a bound project is gated on `epic:bind` —
 * admin-only, because an epic's binding is the ceiling on everything a seat reaches in Microtask. A list of
 * up to five hundred task names is materially more than one name, so a seat is answered none.
 *
 * What a seat does get is the rest of the field: the linked task's name when it is owed one, the `Unlink`
 * button, and `Create the task` where the rail is bound at an effective `manage`. So a seat can unlink and
 * create, and cannot browse. That asymmetry is the grant, written out.
 *
 * ### The reads
 *
 * Four, and three of them shared. `readShare` and `readSeatPlan` are `cache()`d and the layout has already
 * made both, so this page adds the description and the bridge — and the bridge is `cache()`d too, on the
 * token and the plan id, so the layout's progress numbers and this page's link facts are one request.
 *
 * The plan id is **not in this URL**: it comes from `readShare`, the API's own answer about what this token
 * is rooted in, so there is no field in the address for a hand edit to point at another plan.
 *
 * A description read that was refused is `null` and the box is simply absent — not a not-found page over a
 * feature, a rail and a sprint that were all read successfully (`read-seat-item.ts` argues it).
 *
 * A `featureId` in this segment is `notFound()`, the kind being checked, so the two segments cannot answer
 * for each other.
 */
export default async function SeatItemDrawerPage({ params }: SeatItemDrawerPageProps) {
  const { token, itemId } = await params
  const share = await readShare(token)
  if (!share.ok) return null
  const planId = share.value.scope.planId
  const plan = await readSeatPlan(token, planId)
  if (!plan.ok) return null
  const subject = drawerSubject(plan.value, 'item', itemId)
  if (subject === undefined) notFound()
  const [described, bridge] = await Promise.all([
    readSeatDescription(token, planId, itemId),
    readSeatBridge(token, planId),
  ])
  const controls = planCapabilities(share.value.role, share.value.scope)
  const writes = seatPlanActions(token)
  const state = itemLink(plan.value, bridge, itemId, null)
  return (
    <DrawerPanel
      actions={writes}
      closeHref={linkPath(token)}
      controls={controls.content}
      description={described.ok ? described.value : null}
      link={
        controls.content.linkItem ? (
          <LinkField
            bound={state.bound}
            createTask={writes.createTask}
            itemId={itemId}
            link={writes.linkItem}
            manages={state.manages}
            mayCreate={controls.content.createTask}
            mayUnlink={controls.content.unlinkItem}
            options={state.options}
            planId={planId}
            taskName={state.taskName}
            unlink={writes.unlinkItem}
          />
        ) : null
      }
      planId={planId}
      row={subject.row}
      values={subject.values}
    />
  )
}
