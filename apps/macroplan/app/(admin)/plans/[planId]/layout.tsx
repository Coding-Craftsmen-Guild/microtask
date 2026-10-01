import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ADMIN_PLAN_ACTIONS } from '../../../../components/plan/admin-actions'
import { attentionOf } from '../../../../components/plan/attention/attention'
import { PlanScreen } from '../../../../components/plan/plan-screen'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { ADMIN_DRAWER_ROUTES, PLAN_DRAWERS } from '../../../../lib/drawer-routes'
import { zoomFor } from '../../../../components/plan/canvas/zoom-view'
import { zoomTo } from '../../../../actions/zoom'
import { readZoom } from '../../../../lib/zoom'
import { groupsSlot, manageSlot, traySlot, zoomSlot } from './admin-slots'
import { readBridge } from './read-bridge'
import { readPlan } from './read-plan'

/** Props for {@link PlanLayout}, which Next supplies. */
export interface PlanLayoutProps {
  readonly params: Promise<{ readonly planId: string }>

  readonly children: ReactNode
}

/** The tab title: the plan's own name, from the same read the page is drawn from. */
export async function generateMetadata({ params }: Pick<PlanLayoutProps, 'params'>): Promise<Metadata> {
  const loaded = await readPlan((await params).planId)
  return {
    title: loaded.ok ? `${loaded.value.name} · CC Guild Macroplan` : 'Plan · CC Guild Macroplan',
  }
}

/**
 * The plan, and whatever drawer route is open beside it.
 *
 * The plan is read **here** rather than in the page, so that opening a drawer re-renders a panel of
 * forty elements rather than the whole canvas (ADR 0057). The cost is that this cannot see
 * `searchParams`, which is why the zoom is a cookie.
 */
export default async function PlanLayout({ params, children }: PlanLayoutProps) {
  const planId = (await params).planId
  const [loaded, bridge, chosen] = await Promise.all([readPlan(planId), readBridge(planId), readZoom()])
  if (!loaded.ok) {
    return (
      <p className="py-16 text-center text-muted-foreground" role="alert">
        {loaded.detail}
      </p>
    )
  }
  const plan = loaded.value
  const found = attentionOf(plan)
  const zoom = zoomFor(chosen, plan)
  return (
    <PlanScreen
      actions={ADMIN_PLAN_ACTIONS}
      at={new Date()}
      controls={ADMIN_CONTROLS}
      drawer={children}
      groups={groupsSlot(plan)}
      manage={manageSlot(plan)}
      newRailHref={PLAN_DRAWERS.newRail(planId, plan.epics.length)}
      plan={plan}
      progress={bridge?.items ?? []}
      root={planId}
      routes={ADMIN_DRAWER_ROUTES}
      tray={traySlot(plan, found)}
      zoom={zoom}
      zoomControl={zoomSlot(zoom)}
      zoomTo={zoomTo}
    />
  )
}
