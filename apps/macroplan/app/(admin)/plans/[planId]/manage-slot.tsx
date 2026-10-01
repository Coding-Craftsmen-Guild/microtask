import {
  createPlanSeat,
  readPlanSeats,
  revokePlanSeat,
  updatePlanSeat,
} from '../../../../actions/plan-share-links'
import { deletePlan, renamePlan, retimePlan } from '../../../../actions/plans'
import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'
import { SettingsSections } from '../../../../components/plan/settings/settings-sections'
import { ShareManager } from '../../../../components/plan/share/share-manager'
import { PlanManage } from '../../../../components/plan/shell/plan-manage'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'

const settingsSlot = (plan: PlanScreenModel) => {
  const { plan: own } = ADMIN_CONTROLS
  if (!own.rename && !own.retime && !own.remove) return null
  return (
    <SettingsSections
      mayRemove={own.remove}
      mayRename={own.rename}
      mayRetime={own.retime}
      plan={plan}
      remove={deletePlan}
      rename={renamePlan}
      retime={retimePlan}
    />
  )
}

const shareSlot = (plan: PlanScreenModel) => {
  const { seats } = ADMIN_CONTROLS
  if (!seats.read && !seats.create) return null
  return (
    <ShareManager
      editSeat={updatePlanSeat}
      listSeats={readPlanSeats}
      mayCreate={seats.create}
      mayRead={seats.read}
      mayRevoke={seats.revoke}
      mayUpdate={seats.update}
      mintSeat={createPlanSeat}
      planId={plan.id}
      revokeSeat={revokePlanSeat}
    />
  )
}

/**
 * The whole-plan actions, at the end of its title row: the settings menu and the share menu.
 *
 * ### Why this is a file of its own beside `admin-slots.tsx`
 *
 * It is the one slot built from **seven** Server Actions, and every one of them is a plan-level write
 * rather than a content write — so it imports two action modules nothing else on this page touches.
 * Keeping it here means `admin-slots.tsx` stays a file about which component fills which slot, and
 * this one stays the file a reader opens to ask what a plan's own menus may do.
 *
 * ### Why neither is a route any more
 *
 * Both were drawers — `/plans/<id>/settings` and `/plans/<id>/share` — and
 * `components/plan/shell/plan-manage.tsx` carries why neither was a selection and so neither needed
 * an address. The capability checks that used to be a `notFound()` in each page are the two `null`s
 * above, which is the same refusal said one layer out: a reader who may change nothing about the plan
 * is drawn no button at all rather than a button onto an empty panel.
 */
export function manageSlot(plan: PlanScreenModel) {
  return <PlanManage settings={settingsSlot(plan)} share={shareSlot(plan)} />
}
