import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { bindEpicProject } from '../../../../actions/bridge'
import { readItemDrawer } from '../../../../actions/drawer-reads'
import { ADMIN_OWN_WRITES, ADMIN_PLAN_ACTIONS, ADMIN_SEAT_ACTIONS } from '../../../../components/plan/admin-actions'
import { PlanApp } from '../../../../components/plan/app/plan-app'
import { zoomFor } from '../../../../components/plan/canvas/zoom-view'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { readZoom } from '../../../../lib/zoom'
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
 * The plan, read once and handed to the browser, which draws it and every drawer beside it.
 *
 * This was the server-rendered plan screen: canvas, table, slots and all, re-rendered and re-shipped on
 * every edit, zoom and drawer (ADR 0057). It now reads what only the server can — the plan, the bridge, the
 * zoom cookie — and hands it to {@link PlanApp} once, with the Server Actions this surface may call
 * (ADR 0069). The plan is `planScreenModel`'s reduction, so no share token reaches the browser, and every
 * write answers that same reduction. The drawer routes beneath this layout render nothing: the drawer is
 * read off the address in the browser, which is why `children` is passed through untouched.
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
  return (
    <PlanApp
      actions={ADMIN_PLAN_ACTIONS}
      at={new Date().toISOString()}
      bindProject={bindEpicProject}
      bridge={bridge}
      controls={ADMIN_CONTROLS}
      own={ADMIN_OWN_WRITES}
      plan={loaded.value}
      readItem={readItemDrawer}
      seats={ADMIN_SEAT_ACTIONS}
      surface={{ kind: 'admin', planId }}
      zoom={zoomFor(chosen, loaded.value)}
    >
      {children}
    </PlanApp>
  )
}
