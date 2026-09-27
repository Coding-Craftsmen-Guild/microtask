import type { PlanEditActions } from '../../../components/plan/edit-actions'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { seatGroupsPanel, seatRailsPanel } from './seat-content-panels'
import { ShareManager } from '../../../components/plan/share/share-manager'
import type { SeatManagerActions, SeatPlanOwnActions } from '../../../components/plan/seat-own-actions'
import { SettingsPanel } from '../../../components/plan/settings/settings-panel'
import type { PlanControls } from '../../../lib/plan-capabilities'

const PANELS = 'grid gap-2 border-t border-border px-3 py-3'

/** The three action records a seat's panels write through, named together so none is passed alone. */
export interface SeatPanelActions {
  readonly writes: PlanEditActions
  readonly own: SeatPlanOwnActions
  readonly seats: SeatManagerActions
}

const settingsPanel = (plan: PlanScreenModel, own: SeatPlanOwnActions, controls: PlanControls) => {
  const { plan: mine } = controls
  if (!mine.rename && !mine.retime && !mine.remove) return null
  return (
    <SettingsPanel
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

const sharePanel = (plan: PlanScreenModel, seats: SeatManagerActions, controls: PlanControls) => {
  if (!controls.seats.read) return null
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
 * Everything a seat may manage, under the rail tree in the sidebar.
 *
 * ### Why here and not in drawers
 *
 * The admin surface opens a rail, a group, the settings and the share list as routes (ADR 0057). The
 * seat surface addresses features and items and nothing else, so there is no `/s/<token>/settings`
 * to link to, and building four more routes is a larger change than this revision is. Until there
 * is, these stay the collapsed panels they have always been — moved out of the page body, where
 * they pushed the board down, and into the column that already scrolls.
 *
 * A `view` seat, which is what most links are, gets `null` from all four and no panel at all.
 */
export function seatManageSlot(
  plan: PlanScreenModel,
  actions: SeatPanelActions,
  controls: PlanControls,
) {
  const panels = [
    seatRailsPanel(plan, actions.writes, controls),
    seatGroupsPanel(plan, actions.writes, controls),
    settingsPanel(plan, actions.own, controls),
    sharePanel(plan, actions.seats, controls),
  ].filter((panel) => panel !== null)
  if (panels.length === 0) return null
  return (
    <div className={PANELS} data-slot="seat-manage">
      {panels}
    </div>
  )
}
