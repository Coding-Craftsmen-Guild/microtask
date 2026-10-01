import type { PlanEditActions } from '../../../components/plan/edit-actions'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { seatGroupsPanel, seatRailsPanel } from './seat-content-panels'
import { PlanManage } from '../../../components/plan/shell/plan-manage'
import { ShareManager } from '../../../components/plan/share/share-manager'
import type { SeatManagerActions, SeatPlanOwnActions } from '../../../components/plan/seat-own-actions'
import { SettingsSections } from '../../../components/plan/settings/settings-sections'
import type { PlanControls } from '../../../lib/plan-capabilities'

const PANELS = 'grid gap-2 border-t border-border px-3 py-3'

/** The three action records a seat's panels write through, named together so none is passed alone. */
export interface SeatPanelActions {
  readonly writes: PlanEditActions
  readonly own: SeatPlanOwnActions
  readonly seats: SeatManagerActions
}

const settingsSlot = (plan: PlanScreenModel, own: SeatPlanOwnActions, controls: PlanControls) => {
  const { plan: mine } = controls
  if (!mine.rename && !mine.retime && !mine.remove) return null
  return (
    <SettingsSections
      mayRemove={mine.remove}
      mayRename={mine.rename}
      mayRetime={mine.retime}
      plan={plan}
      remove={own.remove}
      rename={own.rename}
      retime={own.retime}
    />
  )
}

const shareSlot = (plan: PlanScreenModel, seats: SeatManagerActions, controls: PlanControls) => {
  if (!controls.seats.read && !controls.seats.create) return null
  return (
    <ShareManager
      editSeat={seats.update}
      listSeats={seats.list}
      mayCreate={controls.seats.create}
      mayRead={controls.seats.read}
      mayRevoke={controls.seats.revoke}
      mayUpdate={controls.seats.update}
      mintSeat={seats.create}
      planId={plan.id}
      revokeSeat={seats.revoke}
    />
  )
}

/**
 * What a seat may do to the plan itself, in the head row beside the admin's own two menus.
 *
 * ### Why these climbed out of the sidebar
 *
 * They were two collapsed panels under the rail tree, because this surface has no `/s/<token>/settings`
 * to link to and the admin's equivalents were drawer routes. Neither of those is true any more: the
 * admin's are menus in the head row (`components/plan/shell/plan-manage.tsx`), and a menu needs no
 * route, so the two surfaces can finally render the one control. A `manage` seat and an admin now
 * reach a plan's calendar the same way, which is what this file previously had to say they could not.
 *
 * A `view` seat, which is what most links are, is refused both and the row draws neither button.
 */
export function seatManageSlot(
  plan: PlanScreenModel,
  actions: SeatPanelActions,
  controls: PlanControls,
) {
  const settings = settingsSlot(plan, actions.own, controls)
  const share = shareSlot(plan, actions.seats, controls)
  if (settings === null && share === null) return null
  return <PlanManage settings={settings} share={share} />
}

/**
 * What a seat may do to what the plan *holds* — its rails and its groups — under the rail tree.
 *
 * These stay in the sidebar where the two above left it, and the division is the one
 * `seat-content-panels.tsx` already draws: these write content, the other two write the plan itself
 * and who may open it. A rail panel belongs beside the rails.
 */
export function seatContentSlot(
  plan: PlanScreenModel,
  actions: SeatPanelActions,
  controls: PlanControls,
) {
  const panels = [
    seatRailsPanel(plan, actions.writes, controls),
    seatGroupsPanel(plan, actions.writes, controls),
  ].filter((panel) => panel !== null)
  if (panels.length === 0) return null
  return (
    <div className={PANELS} data-slot="seat-manage">
      {panels}
    </div>
  )
}
