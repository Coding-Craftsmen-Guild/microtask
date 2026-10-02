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
import { addsFor, drawsFor } from './table/table-writes'
import { writesFor } from './table/table-writes'
import { nextRailColour } from './rails/rail-palette'
import { PlanHead } from './shell/plan-head'
import { PlanShell } from './shell/plan-shell'
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
}

/**
 * The whole plan page: a frame, a head row, a tree and a board.
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
 * `toolbar`, `home` and `sidebar` are the restyle's. The control strip merged into the head row, which is one
 * region rather than two over the same board (`shell/shell-css.ts`), and the breadcrumb climbed into
 * the brand bar, where a breadcrumb goes (`app/(admin)/plan-crumb.tsx`). The seat surface still draws
 * no crumb at all, for the reason that prop used to record: it holds one plan and has no index above
 * it, and a trail whose parent is a sign-in page with no password behind it is worse than none.
 *
 * The rail tree went with `sidebar`. It listed every rail and every feature in a pane beside a board
 * that lists the same rails, and the board's own column is where they are now
 * (`board/rail-column.tsx`).
 *
 * ### Why the style element is here
 *
 * `VIEW_SWITCH_CSS` is a `:has()` rule anchored on the shell, so it has to be inside a document that
 * contains the shell and it may as well be next to the thing it describes. It is static, unlike the
 * group and selection sheets, which are generated per plan.
 */
export function PlanScreen(props: PlanScreenProps) {
  const { plan, at, actions, controls, drawer, groups, progress } = props
  const { manage, newRailHref, root, routes, tray, zoom, zoomControl, zoomTo } = props
  const place = actions !== null && controls.content.placeFeature ? actions.placeFeature : null
  const axis = planAxis(plan, at, zoom)
  const pointer = { axisX: axisX(axis.scale, axis.range), pxPerDay: axis.scale.pxPerDay }
  return (
    <>
      <style>{VIEW_SWITCH_CSS}</style>
      <style>{POINTER_CSS}</style>
      <PlanPointer {...pointer} rung={zoom} zoomTo={zoomTo}>
        <PlanShell
          drawer={drawer}
          head={
            <PlanHead
              actions={manage}
              attention={<AttentionChip count={attentionCount(plan, attentionOf(plan))} />}
              groups={groups}
              plan={plan}
              zoom={zoomControl}
            />
          }
        >
          <PlanViews
            at={at}
            draw={drawsFor(actions, controls.content)}
            newRailHref={controls.content.createEpic ? newRailHref : null}
            place={place}
            plan={plan}
            progress={progress}
            root={root}
            routes={routes}
            tray={tray}
            adds={addsFor(actions, controls.content)}
            nextRailColour={nextRailColour(plan.epics.length)}
            writes={writesFor(controls.content)}
            zoom={zoom}
          />
        </PlanShell>
      </PlanPointer>
    </>
  )
}
