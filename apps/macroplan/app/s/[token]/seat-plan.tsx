import type { ReactNode } from 'react'
import { attentionOf } from '../../../components/plan/attention/attention'
import { PlanScreen } from '../../../components/plan/plan-screen'
import { seatPlanActions } from '../../../components/plan/seat-actions'
import { seatPlanOwnActions, seatSeatActions } from '../../../components/plan/seat-own-actions'
import { openingZoom } from '../../../components/plan/canvas/zoom-view'
import { SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import { planCapabilities } from '../../../lib/plan-capabilities'
import { seatGroupsSlot, seatSidebarSlot, seatTraySlot } from './seat-slots'
import { seatManageSlot } from './seat-plan-slots'
import { readSeatBridge } from './read-seat-item'
import { readSeatPlan, readShare } from './read-share'

const refused = (detail: string): ReactNode => (
  <p className="py-16 text-center text-muted-foreground" role="alert">
    {detail}
  </p>
)

/**
 * The one plan a token opens, drawn with whatever is open beside it.
 *
 * The token is taken from `params` and is the only authority presented: **no cookie is read**, so an
 * admin signed in on the same browser sees exactly what the seat sees, and a page on this surface
 * cannot be elevated by one (ADR 0040). `seat-plan.test.tsx` mocks `next/headers` to throw, which is
 * what keeps that true as this file changes.
 *
 * ### The zoom it cannot have
 *
 * Zoom is a cookie the admin's layout reads, and this surface may read no cookie, so it draws at
 * {@link DEFAULT_ZOOM}. That was a real limitation while the canvas drew a fixed 120-day axis — a
 * short plan at the default zoom was a handful of bars in the corner of a mostly empty chart. It is
 * a much smaller one now: the axis follows the plan's own span, so the default fills the pane for
 * whatever this plan happens to be. Restoring the control here means putting the rung in the path,
 * which is left for when someone asks.
 *
 * ### The sidebar it now has
 *
 * It passes one. The previous revision passed `null`, and because the split was a two-column grid, a
 * null child meant the board became the *first* grid item and drew itself into the 17rem names
 * track: a 272px timeline on a 1545px page. Both surfaces render the same tree now, with the seat's
 * own capabilities deciding which actions are on it.
 */
export async function seatPlanScreen(token: string, drawer: ReactNode) {
  const share = await readShare(token)
  if (!share.ok) return refused(share.detail)
  const { role, scope } = share.value
  const plan = await readSeatPlan(token, scope.planId)
  if (!plan.ok) return refused(plan.detail)
  const controls = planCapabilities(role, scope)
  const writes = seatPlanActions(token)
  const own = seatPlanOwnActions(token)
  const seats = seatSeatActions(token)
  const bridge = await readSeatBridge(token, scope.planId)
  const found = attentionOf(plan.value)
  return (
    <PlanScreen
      actions={writes}
      at={new Date()}
      controls={controls}
      drawer={drawer}
      groups={seatGroupsSlot(plan.value)}
      home={null}
      manage={null}
      plan={plan.value}
      progress={bridge?.items ?? []}
      root={token}
      routes={SEAT_DRAWER_ROUTES}
      sidebar={
        <>
          {seatSidebarSlot(plan.value, token, found)}
          {seatManageSlot(plan.value, { writes, own, seats }, controls)}
        </>
      }
      tray={seatTraySlot(plan.value, token, found)}
      zoom={openingZoom(plan.value)}
      zoomControl={null}
    />
  )
}
