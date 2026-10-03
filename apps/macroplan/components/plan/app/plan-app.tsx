'use client'

import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ADMIN_DRAWER_ROUTES, SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import type { PlanControls } from '../../../lib/plan-capabilities'
import { linkPath, planPath } from '../../../lib/routes'
import type { BindProjectWrite } from '../bridge/bind-project-form'
import type { PlanEditActions } from '../edit-actions'
import type { PlanScreenModel } from '../plan-screen-model'
import type { PlanSeatActions } from '../share/use-plan-seats'
import { planGestures } from '../store/gestures'
import { optimisticActions } from '../store/optimistic-actions'
import { retimePlan } from '../store/plan-edits'
import { createPlanStore } from '../store/plan-store'
import { gestureWritesFor } from '../table/table-writes'
import type { PlanOwnWrites } from './manage-menus'
import { PlanClientScreen } from './plan-client-screen'
import { PlanSessionProvider, type ItemRead, type PlanSession, type PlanSurface } from './plan-session'

/** What a plan layout hands the browser: the plan once, and the Server Actions this surface may call. */
export interface PlanAppProps {
  /** The plan as the server read it, already reduced to what a page may carry (no share token). */
  readonly plan: PlanScreenModel
  readonly bridge: PlanBridge | null
  readonly zoom: Rung

  /** The instant the server rendered at, as ISO 8601, so the server and the browser draw one today line. */
  readonly at: string
  readonly surface: PlanSurface
  readonly controls: PlanControls
  readonly actions: PlanEditActions
  readonly own: PlanOwnWrites
  readonly seats: PlanSeatActions
  readonly readItem: ItemRead
  readonly bindProject: BindProjectWrite | null
  readonly children?: ReactNode
}

const homeOf = (surface: PlanSurface): string =>
  surface.kind === 'admin' ? planPath(surface.planId) : linkPath(surface.token)

const rootOf = (surface: PlanSurface): string => (surface.kind === 'admin' ? surface.planId : surface.token)

/**
 * The plan screen's one client root: the plan crosses to the browser here, once, and everything after is
 * drawn from it (ADR 0069).
 *
 * The store is made once per page and outlives every render; a plan the server pushes later — a re-render
 * after a rename or a bridge write — is adopted into it rather than replacing it, so edits still being saved
 * stay on screen. The writes the surface handed over are wrapped so each goes through the store, and the
 * two chained gestures are built from the raw ones they chain. Retiming goes through the store as well,
 * because a new start date moves every bar and the reader should see that the moment they commit it.
 */
export function PlanApp(props: PlanAppProps) {
  const { plan, surface, controls, actions, bridge, readItem, bindProject, own } = props
  const [store] = useState(() => createPlanStore(plan))
  useEffect(() => {
    store.adopt(plan)
  }, [store, plan])
  const session = useMemo<PlanSession>(
    () => ({
      store,
      writes: optimisticActions(actions, store),
      gestures: planGestures(plan.id, gestureWritesFor(actions, controls.content), store.run),
      controls,
      surface,
      home: homeOf(surface),
      root: rootOf(surface),
      routes: surface.kind === 'admin' ? ADMIN_DRAWER_ROUTES : SEAT_DRAWER_ROUTES,
      bridge,
      readItem,
      bindProject,
    }),
    [store, actions, plan.id, controls, surface, bridge, readItem, bindProject],
  )
  const owned = useMemo<PlanOwnWrites>(
    () => ({
      ...own,
      retime: (planId, timing) => store.run({ apply: (was) => retimePlan(was, timing), send: () => own.retime(planId, timing) }),
    }),
    [own, store],
  )
  return (
    <PlanSessionProvider value={session}>
      <PlanClientScreen at={props.at} own={owned} seats={props.seats} zoom={props.zoom}>
        {props.children}
      </PlanClientScreen>
    </PlanSessionProvider>
  )
}
