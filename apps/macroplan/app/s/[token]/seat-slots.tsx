import type { AttentionMap } from '../../../components/plan/attention/attention'
import { trayRows } from '../../../components/plan/attention/tray-rows'
import { UnscheduledTray } from '../../../components/plan/attention/unscheduled-tray'
import { GroupChips } from '../../../components/plan/labels/group-chips'
import { allWorkFit } from '../../../components/plan/labels/group-fit'
import { labelRows } from '../../../components/plan/labels/label-rows'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'

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
