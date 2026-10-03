import { labelRows } from '../labels/label-rows'
import { LabelsPanel } from '../labels/labels-panel'
import type { PlanScreenModel } from '../plan-screen-model'
import { railRows } from '../rails/rail-rows'
import { RailsPanel } from '../rails/rails-panel'
import { SettingsSections } from '../settings/settings-sections'
import type { DeleteWrite } from '../settings/delete-plan'
import type { RenameWrite } from '../settings/plan-name-form'
import type { RetimeWrite } from '../settings/timing-form'
import { ShareManager } from '../share/share-manager'
import type { PlanSeatActions } from '../share/use-plan-seats'
import { MenuButton } from '../shell/menu-button'
import { PlanManage } from '../shell/plan-manage'
import type { PlanSession } from './plan-session'

/** The plan's own writes: rename, retime, delete. */
export interface PlanOwnWrites {
  readonly rename: RenameWrite
  readonly retime: RetimeWrite
  readonly remove: DeleteWrite
}

/** What the whole-plan menus are drawn from. */
export interface ManageQuery {
  readonly plan: PlanScreenModel
  readonly session: PlanSession
  readonly own: PlanOwnWrites
  readonly seats: PlanSeatActions
}

const settingsOf = ({ plan, session, own }: ManageQuery) => {
  const mine = session.controls.plan
  if (!mine.rename && !mine.retime && !mine.remove) return null
  return (
    <SettingsSections mayRemove={mine.remove} mayRename={mine.rename} mayRetime={mine.retime} plan={plan} remove={own.remove} rename={own.rename} retime={own.retime} />
  )
}

const shareOf = ({ plan, session, seats }: ManageQuery) => {
  const { seats: may } = session.controls
  if (!may.read && !may.create) return null
  return (
    <ShareManager editSeat={seats.update} listSeats={seats.list} mayCreate={may.create} mayRead={may.read} mayRevoke={may.revoke} mayUpdate={may.update} mintSeat={seats.create} planId={plan.id} revokeSeat={seats.revoke} />
  )
}

const contentMenus = ({ plan, session }: ManageQuery) => {
  const { content } = session.controls
  const w = session.writes
  const rails = content.createEpic ? (
    <MenuButton label="Rails" slot="seat-rails-menu" tone="quiet">
      <RailsPanel create={w.createEpic} createFeature={w.createFeature} mayAddFeature={content.createFeature} mayRecolour={content.recolourEpic} mayRemove={content.removeEpic} mayRename={content.renameEpic} mayReorder={content.reorderEpic} planId={plan.id} recolour={w.recolourEpic} remove={w.removeEpic} rename={w.renameEpic} reorder={w.reorderEpic} rows={railRows(plan)} />
    </MenuButton>
  ) : null
  const groups = content.createLabel ? (
    <MenuButton label="Groups" slot="seat-groups-menu" tone="quiet">
      <LabelsPanel create={w.createLabel} mayRecolour={content.recolourLabel} mayRemove={content.removeLabel} mayRename={content.renameLabel} planId={plan.id} recolour={w.recolourLabel} remove={w.removeLabel} rename={w.renameLabel} rows={labelRows(plan)} />
    </MenuButton>
  ) : null
  return { rails, groups }
}

/**
 * The whole-plan menus at the end of the title row, for whichever surface the plan is open on.
 *
 * The admin gets settings and sharing; a seat also gets its rails and groups as menus, because it has no
 * rail or group drawer to edit them in. They were built on the server from the plan and handed over as a
 * slot (`[planId]/manage-slot.tsx`, `s/[token]/seat-plan-slots.tsx`); they are built here from the plan the
 * store holds, so a rail renamed on the board is renamed in the menu in the same frame (ADR 0069).
 *
 * @param query - The plan, the session and the plan's own writes.
 * @returns The menus, or `null` where this viewer may change nothing about the plan.
 */
export function manageMenus(query: ManageQuery) {
  const settings = settingsOf(query)
  const share = shareOf(query)
  if (query.session.surface.kind === 'admin') return <PlanManage settings={settings} share={share} />
  const { rails, groups } = contentMenus(query)
  if (rails === null && groups === null && settings === null && share === null) return null
  return (
    <span className="contents" data-slot="seat-manage">
      {rails}
      {groups}
      <PlanManage settings={settings} share={share} />
    </span>
  )
}
