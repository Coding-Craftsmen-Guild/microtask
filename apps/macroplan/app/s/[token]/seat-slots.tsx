import type { AttentionMap } from '../../../components/plan/attention/attention'
import { trayRows } from '../../../components/plan/attention/tray-rows'
import { UnscheduledTray } from '../../../components/plan/attention/unscheduled-tray'
import { GroupChips } from '../../../components/plan/labels/group-chips'
import { allWorkFit } from '../../../components/plan/labels/group-fit'
import { labelRows } from '../../../components/plan/labels/label-rows'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { PlanSidebar } from '../../../components/plan/sidebar/plan-sidebar'
import { sidebarRails } from '../../../components/plan/sidebar/sidebar-rows'
import { SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'

/**
 * The rail tree, rooted at the token rather than at a plan id.
 *
 * Every link it draws goes through {@link SEAT_DRAWER_ROUTES}, so a holder following one stays on
 * `/s/<token>/…`. Importing the admin builders — which is what the tree used to do — would have sent
 * them to `/plans/…`, a surface that reads a cookie they have not got, and on to a sign-in page.
 *
 * It carries **no actions**. A seat that may add a rail has no `new/rail` route on this surface to
 * send them to, and a button that navigates nowhere is worse than an absent one.
 */
export function seatSidebarSlot(plan: PlanScreenModel, token: string, found: AttentionMap) {
  return (
    <PlanSidebar
      actions={null}
      found={found}
      rails={sidebarRails(plan)}
      root={token}
      routes={SEAT_DRAWER_ROUTES}
    />
  )
}

/** The features with no bar, addressed at the token so a holder stays on their own surface. */
export function seatTraySlot(plan: PlanScreenModel, token: string, found: AttentionMap) {
  return (
    <UnscheduledTray
      found={found}
      root={token}
      routes={SEAT_DRAWER_ROUTES}
      rows={trayRows(plan)}
    />
  )
}

/** The group chips, which a holder may use to pick out work across rails whatever their role. */
export function seatGroupsSlot(plan: PlanScreenModel) {
  return <GroupChips allFit={allWorkFit(plan)} mayAdd={false} planId={null} rows={labelRows(plan)} />
}
