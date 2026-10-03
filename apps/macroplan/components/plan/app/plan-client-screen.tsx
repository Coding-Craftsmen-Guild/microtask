import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import { useMemo, useState, type ReactNode } from 'react'
import { PLAN_DRAWERS } from '../../../lib/drawer-routes'
import { attentionOf } from '../attention/attention'
import { trayRows } from '../attention/tray-rows'
import { UnscheduledTray } from '../attention/unscheduled-tray'
import { ZoomSwitch } from '../canvas/zoom-switch'
import { GroupChips } from '../labels/group-chips'
import { allWorkFit } from '../labels/group-fit'
import { labelRows } from '../labels/label-rows'
import { PlanScreen } from '../plan-screen'
import type { PlanSeatActions } from '../share/use-plan-seats'
import type { PlanView } from '../view-switch'
import { manageMenus, type PlanOwnWrites } from './manage-menus'
import { PlanDrawer } from './plan-drawer'
import { PlanNotice } from './plan-notice'
import { usePlan, usePlanSession } from './plan-session'
import { useZoom } from './use-zoom'

const NO_PROGRESS: PlanBridge['items'] = []

/** Props for {@link PlanClientScreen}. */
export interface PlanClientScreenProps {
  /** The instant the server rendered at, which the today line is drawn against. */
  readonly at: string

  /** The rung the server rendered at. */
  readonly zoom: Rung

  readonly own: PlanOwnWrites
  readonly seats: PlanSeatActions

  /** The route's own page, which draws nothing now that the drawer is drawn here. */
  readonly children?: ReactNode
}

/**
 * The plan screen as the browser draws it: the store's plan, the screen's own zoom and view, and every slot
 * the server used to build — group chips, the unscheduled tray, the whole-plan menus, the drawer — built
 * here from the same plan, so all of them change in the frame an edit is made in (ADR 0069).
 *
 * The derived rows are memoised on the plan object, which the store replaces exactly when the plan
 * changes, so a zoom, a view switch or a hover recomputes none of them.
 */
export function PlanClientScreen({ at, zoom: opening, own, seats, children }: PlanClientScreenProps) {
  const session = usePlanSession()
  const plan = usePlan()
  const admin = session.surface.kind === 'admin'
  const { zoom, zoomTo } = useZoom(opening, admin)
  const [view, setView] = useState<PlanView>('timeline')
  const now = useMemo(() => new Date(at), [at])
  const { content } = session.controls
  const groups = useMemo(
    () => <GroupChips allFit={allWorkFit(plan)} mayAdd={admin && content.createLabel} planId={admin ? plan.id : null} rows={labelRows(plan)} />,
    [plan, admin, content.createLabel],
  )
  const tray = useMemo(
    () => <UnscheduledTray found={attentionOf(plan)} root={session.root} routes={session.routes} rows={trayRows(plan)} />,
    [plan, session.root, session.routes],
  )
  return (
    <>
      <PlanScreen
        actions={session.writes}
        at={now}
        controls={session.controls}
        drawer={<><PlanDrawer />{children}</>}
        gestures={session.gestures}
        groups={groups}
        manage={manageMenus({ plan, session, own, seats })}
        newRailHref={admin && content.createEpic ? PLAN_DRAWERS.newRail(plan.id, plan.epics.length) : null}
        onView={setView}
        plan={plan}
        progress={session.bridge?.items ?? NO_PROGRESS}
        real={session.store.real}
        root={session.root}
        routes={session.routes}
        tray={tray}
        view={view}
        zoom={zoom}
        zoomControl={zoomTo === null ? null : <ZoomSwitch onZoom={(rung) => void zoomTo(rung)} zoom={zoom} />}
        zoomTo={zoomTo}
      />
      <PlanNotice />
    </>
  )
}
