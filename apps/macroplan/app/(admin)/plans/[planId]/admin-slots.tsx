import type { AttentionMap } from '../../../../components/plan/attention/attention'
import { UnscheduledTray } from '../../../../components/plan/attention/unscheduled-tray'
import { trayRows } from '../../../../components/plan/attention/tray-rows'
import { GroupChips } from '../../../../components/plan/labels/group-chips'
import { allWorkFit } from '../../../../components/plan/labels/group-fit'
import { labelRows } from '../../../../components/plan/labels/label-rows'
import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'
import { ZoomSwitch } from '../../../../components/plan/canvas/zoom-switch'
import { PlanManage } from '../../../../components/plan/shell/plan-manage'
import { PlanSidebar } from '../../../../components/plan/sidebar/plan-sidebar'
import { SidebarActions } from '../../../../components/plan/sidebar/sidebar-actions'
import { sidebarRails } from '../../../../components/plan/sidebar/sidebar-rows'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { ADMIN_DRAWER_ROUTES } from '../../../../lib/drawer-routes'
import type { Rung } from '@repo/canvas'

/** The rail tree, with the admin's own routes and whichever actions the admin may take. */
export function sidebarSlot(plan: PlanScreenModel, found: AttentionMap) {
  const { content } = ADMIN_CONTROLS
  return (
    <PlanSidebar
      actions={<SidebarActions mayAddRail={content.createEpic} planId={plan.id} railCount={plan.epics.length} />}
      found={found}
      rails={sidebarRails(plan)}
      root={plan.id}
      routes={ADMIN_DRAWER_ROUTES}
    />
  )
}

/** The whole-plan actions, beside the plan's name. */
export function manageSlot(plan: PlanScreenModel) {
  const { plan: own, seats } = ADMIN_CONTROLS
  return (
    <PlanManage
      maySettings={own.rename || own.retime || own.remove}
      mayShare={seats.read || seats.create}
      planId={plan.id}
    />
  )
}

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
