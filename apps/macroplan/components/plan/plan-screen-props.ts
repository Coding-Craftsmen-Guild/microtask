import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import type { ReactNode } from 'react'
import type { DrawerRoutes } from '../../lib/drawer-routes'
import type { PlanControls } from '../../lib/plan-capabilities'
import type { PlanEditActions } from './edit-actions'
import type { PlanScreenModel } from './plan-screen-model'
import type { PlanGestures } from './store/gestures'
import type { PlanView } from './view-switch'

/** Props for `PlanScreen` (`./plan-screen.tsx`). */
export interface PlanScreenProps {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly zoom: Rung

  readonly controls: PlanControls

  readonly actions: PlanEditActions | null

  /** Whatever route is open beside the plan. */
  readonly drawer: ReactNode

  /** Whole-plan actions — share, settings — already filtered by what this viewer may do. */
  readonly manage: ReactNode

  /** The group chips, which filter both views. */
  readonly groups: ReactNode

  /** The zoom control. */
  readonly zoomControl: ReactNode

  /**
   * The zoom write a gesture calls, or `null` on a surface that cannot remember one.
   *
   * A prop rather than an import, though `ZoomSwitch` imports the same action directly: that control is
   * mounted by the admin surface alone and this screen is mounted by both. The seat surface has no zoom
   * cookie to read, so a gesture there would write one nothing reads and revalidate a layout it is not
   * in — it passes `null`, and the root then leaves every wheel to the browser.
   */
  readonly zoomTo: ((rung: string) => Promise<void>) | null

  /** The features with no bar, listed under the board. */
  readonly tray: ReactNode

  /** The plan id or the seat token, whichever roots this surface’s URLs. */
  readonly root: string

  readonly routes: DrawerRoutes

  /**
   * Where the table's one plan-level add goes, or `null` where this surface has nowhere for it.
   *
   * The **surface** builds it and this screen only passes it on, which is the rule {@link DrawerRoutes}
   * exists to enforce: `/plans/<id>/new/rail` is an admin path, and a seat holder following one would
   * meet a login they have no password for (ADR 0032). Building it here from `PLAN_DRAWERS` would have
   * done exactly that, because a manage seat may create a rail — the capability is granted and the route
   * is not, and only the page knows which surface it is.
   */
  readonly newRailHref: string | null

  readonly progress: PlanBridge['items']

  /** The board's chained gestures — draw and rail drop — or `null` on a surface handed no writes. */
  readonly gestures: PlanGestures | null

  /** Which rendering is on screen. */
  readonly view: PlanView

  /** Choose the other rendering. */
  readonly onView: (view: PlanView) => void

  /**
   * The store's `real`, which the shell reads the chosen group and rail through: one chosen while it was still
   * being created is named by its create's answer (`./shell/plan-shell.tsx`). Left out, ids are read as they are.
   */
  readonly real?: (id: string) => string
}
