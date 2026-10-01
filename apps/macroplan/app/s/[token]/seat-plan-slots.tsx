import type { PlanEditActions } from '../../../components/plan/edit-actions'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { seatGroupsPanel, seatRailsPanel } from './seat-content-panels'
import { MenuButton } from '../../../components/plan/shell/menu-button'
import { PlanManage } from '../../../components/plan/shell/plan-manage'
import { ShareManager } from '../../../components/plan/share/share-manager'
import type { SeatManagerActions, SeatPlanOwnActions } from '../../../components/plan/seat-own-actions'
import { SettingsSections } from '../../../components/plan/settings/settings-sections'
import type { PlanControls } from '../../../lib/plan-capabilities'

const WORDS = { rails: 'Rails', groups: 'Groups' } as const

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

const contentMenu = (label: string, slot: string, panel: ReturnType<typeof seatRailsPanel>) =>
  panel === null ? null : (
    <MenuButton label={label} slot={slot} tone="quiet">
      {panel}
    </MenuButton>
  )

/**
 * Everything a seat may manage, as menus at the end of the plan's head row.
 *
 * ### Why all four climbed out of the sidebar
 *
 * They were four collapsed panels under the rail tree, in the one pane this surface had that could
 * scroll, because the admin's equivalents were drawer routes and this surface has no address for any
 * of them. Neither half of that is true any more: the rail tree is gone, and the admin's plan-level
 * controls are menus (`components/plan/shell/plan-manage.tsx`) — and a menu needs no route. So a
 * manage seat and an admin reach a plan's calendar the same way, which is what this file previously
 * had to say they could not.
 *
 * Rails and Groups stay this surface's own, because the admin reaches those through `/r/<epicId>` and
 * `/g/<labelId>`, two addresses a token does not open. The division is the same one
 * `seat-content-panels.tsx` already drew: these two write what the plan **holds**, the other two
 * write the plan itself and who may open it.
 *
 * A `view` seat, which is what most links are, is refused all four and the row draws nothing.
 */
export function seatManageSlot(
  plan: PlanScreenModel,
  actions: SeatPanelActions,
  controls: PlanControls,
) {
  const rails = contentMenu(WORDS.rails, 'seat-rails-menu', seatRailsPanel(plan, actions.writes, controls))
  const groups = contentMenu(WORDS.groups, 'seat-groups-menu', seatGroupsPanel(plan, actions.writes, controls))
  const settings = settingsSlot(plan, actions.own, controls)
  const share = shareSlot(plan, actions.seats, controls)
  if (rails === null && groups === null && settings === null && share === null) return null
  return (
    <span className="contents" data-slot="seat-manage">
      {rails}
      {groups}
      <PlanManage settings={settings} share={share} />
    </span>
  )
}
