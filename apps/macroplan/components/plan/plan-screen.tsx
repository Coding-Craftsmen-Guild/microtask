import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import type { ReactNode } from 'react'
import type { PlanControls } from '../../lib/plan-capabilities'
import { attentionCount, attentionOf } from './attention/attention'
import { AttentionChip } from './attention/attention-mark'
import { PlanPointer } from './canvas/plan-pointer'
import { POINTER_CSS } from './canvas/pointer-css'
import { axisX } from './canvas/view'
import { planAxis } from './canvas/zoom-view'
import { PlanViews } from './plan-views'
import { PlanHead } from './shell/plan-head'
import { PlanShell } from './shell/plan-shell'
import { PlanToolbar } from './shell/plan-toolbar'
import type { PlanEditActions } from './edit-actions'
import type { PlanScreenModel } from './plan-screen-model'
import type { DrawerRoutes } from '../../lib/drawer-routes'
import { VIEW_SWITCH_CSS } from './view-switch'

/** Props for {@link PlanScreen}. */
export interface PlanScreenProps {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly zoom: Rung

  readonly controls: PlanControls

  readonly actions: PlanEditActions | null

  /** Whatever route is open beside the plan. */
  readonly drawer: ReactNode

  /** The rail tree and its filter, as its own scrolling pane. */
  readonly sidebar: ReactNode

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

  /** Where the breadcrumb climbs to, or nothing on a surface with no plan list. */
  readonly home: string | null

  /** The plan id or the seat token, whichever roots this surface’s URLs. */
  readonly root: string

  readonly routes: DrawerRoutes

  readonly progress: PlanBridge['items']
}

/**
 * The whole plan page: a frame, a toolbar, a tree and a board.
 *
 * ### What left
 *
 * `conflicts` did. A panel listing everything wrong with the plan sat above the board and pushed it
 * off the first screen; its content now lives on the entities it is about — a dot in the tree, a
 * callout in a drawer, and one tray row per feature that has no bar. `components/plan/attention/`
 * carries the argument.
 *
 * `rails`, `share`, `settings` and `bridge` did too. Four separate `ReactNode` slots, each a panel
 * the heading rendered in a row, became `manage`: the surface decides what a viewer may do and hands
 * over the controls, and this lays them out in one place.
 *
 * ### Why the style element is here
 *
 * `VIEW_SWITCH_CSS` is a `:has()` rule anchored on the shell, so it has to be inside a document that
 * contains the shell and it may as well be next to the thing it describes. It is static, unlike the
 * group and selection sheets, which are generated per plan.
 */
export function PlanScreen(props: PlanScreenProps) {
  const { plan, at, actions, controls, drawer, groups, progress, sidebar } = props
  const { home, manage, root, routes, tray, zoom, zoomControl, zoomTo } = props
  const place = actions !== null && controls.content.placeFeature ? actions.placeFeature : null
  const found = attentionOf(plan)
  const axis = planAxis(plan, at, zoom)
  return (
    <>
      <style>{VIEW_SWITCH_CSS}</style>
      <style>{POINTER_CSS}</style>
      <PlanPointer
        axisX={axisX(axis.scale, axis.range)}
        pxPerDay={axis.scale.pxPerDay}
        rung={zoom}
        zoomTo={zoomTo}
      >
        <PlanShell
          drawer={drawer}
          head={
            <PlanHead
              actions={manage}
              attention={<AttentionChip count={attentionCount(plan, found)} />}
              home={home}
              plan={plan}
            />
          }
          sidebar={sidebar}
          toolbar={<PlanToolbar groups={groups} zoom={zoomControl} />}
        >
          <PlanViews
            at={at}
            place={place}
            plan={plan}
            progress={progress}
            root={root}
            routes={routes}
            tray={tray}
            zoom={zoom}
          />
        </PlanShell>
      </PlanPointer>
    </>
  )
}
