import type { ReactNode } from 'react'
import { seatReadItemDrawer } from '../../../actions/drawer-reads'
import { PlanApp } from '../../../components/plan/app/plan-app'
import { openingZoom } from '../../../components/plan/canvas/zoom-view'
import { seatPlanActions } from '../../../components/plan/seat-actions'
import { seatPlanOwnActions, seatSeatActions } from '../../../components/plan/seat-own-actions'
import { planCapabilities } from '../../../lib/plan-capabilities'
import { readSeatBridge } from './read-seat-item'
import { readSeatPlan, readShare } from './read-share'

const refused = (detail: string): ReactNode => (
  <p className="py-16 text-center text-muted-foreground" role="alert">
    {detail}
  </p>
)

/**
 * The one plan a token opens, handed to the browser with the writes the seat's own role allows.
 *
 * The token is taken from `params` and is the only authority presented: **no cookie is read**, so an
 * admin signed in on the same browser sees exactly what the seat sees, and a page on this surface
 * cannot be elevated by one (ADR 0040). `seat-plan.test.tsx` mocks `next/headers` to throw, which is
 * what keeps that true as this file changes. Every write the browser is handed is bound to that token,
 * the mechanism ADR 0040 describes, and the item reads are too.
 *
 * The plan and the bridge are read side by side: both need only the plan id the share answered with, and
 * reading them one after the other was a round trip to the API for nothing.
 *
 * ### The zoom it cannot keep
 *
 * Zoom is a cookie the admin's layout reads, and this surface may read no cookie, so it opens at the
 * plan's own fit and offers no control (ADR 0069 leaves it so). The screen is the same component the
 * admin's is, drawn in the browser from the same kind of plan, with the seat's capabilities deciding what
 * is on it.
 */
export async function seatPlanScreen(token: string, drawer: ReactNode) {
  const share = await readShare(token)
  if (!share.ok) return refused(share.detail)
  const { role, scope } = share.value
  const [plan, bridge] = await Promise.all([readSeatPlan(token, scope.planId), readSeatBridge(token, scope.planId)])
  if (!plan.ok) return refused(plan.detail)
  return (
    <PlanApp
      actions={seatPlanActions(token)}
      at={new Date().toISOString()}
      bindProject={null}
      bridge={bridge}
      controls={planCapabilities(role, scope)}
      own={seatPlanOwnActions(token)}
      plan={plan.value}
      readItem={seatReadItemDrawer.bind(null, token)}
      seats={seatSeatActions(token)}
      surface={{ kind: 'seat', token }}
      zoom={openingZoom(plan.value)}
    >
      {drawer}
    </PlanApp>
  )
}
