import type { AttentionMap } from '../../../../components/plan/attention/attention'
import { UnscheduledTray } from '../../../../components/plan/attention/unscheduled-tray'
import { trayRows } from '../../../../components/plan/attention/tray-rows'
import { GroupChips } from '../../../../components/plan/labels/group-chips'
import { allWorkFit } from '../../../../components/plan/labels/group-fit'
import { labelRows } from '../../../../components/plan/labels/label-rows'
import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'
import { ZoomSwitch } from '../../../../components/plan/canvas/zoom-switch'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { ADMIN_DRAWER_ROUTES } from '../../../../lib/drawer-routes'
import type { Rung } from '@repo/canvas'

/** The whole-plan menus, re-exported so a page fills every slot from one import. */
export { manageSlot } from './manage-slot'

/** The features with no bar, under the board. */
export function traySlot(plan: PlanScreenModel, found: AttentionMap) {
  return (
    <UnscheduledTray
      found={found}
      root={plan.id}
      routes={ADMIN_DRAWER_ROUTES}
      rows={trayRows(plan)}
    />
  )
}

/** The group chips, which filter both views at once. */
export function groupsSlot(plan: PlanScreenModel) {
  return (
    <GroupChips
      allFit={allWorkFit(plan)}
      mayAdd={ADMIN_CONTROLS.content.createLabel}
      planId={plan.id}
      rows={labelRows(plan)}
    />
  )
}

/** The zoom control, which the admin surface has because it can remember a choice in a cookie. */
export function zoomSlot(zoom: Rung) {
  return <ZoomSwitch zoom={zoom} />
}
