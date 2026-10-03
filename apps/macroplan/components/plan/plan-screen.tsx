import { useMemo } from 'react'
import { attentionCount, attentionOf } from './attention/attention'
import { AttentionChip } from './attention/attention-mark'
import { PlanPointer } from './canvas/plan-pointer'
import { POINTER_CSS } from './canvas/pointer-css'
import { axisX } from './canvas/view'
import { planAxis } from './canvas/zoom-view'
import { PlanViews } from './plan-views'
import { boardWritesFor, writesFor } from './table/table-writes'
import { nextRailColour } from './rails/rail-palette'
import { PlanHead } from './shell/plan-head'
import { PlanShell } from './shell/plan-shell'
import type { PlanScreenProps } from './plan-screen-props'

export type { PlanScreenProps } from './plan-screen-props'

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
 * ### What it derives, and how often
 *
 * It is drawn in the browser from the plan the store holds (ADR 0069), so everything it works out from
 * that plan — the axis, and the writes the board and the table are handed — is memoised on what it reads.
 * A drawer opening or a hover leaves all three alone, and so leaves alone everything handed them.
 *
 * The one style element is `POINTER_CSS`, which paints a lit mark; it is static, unlike the group and
 * selection sheets, which are generated per plan.
 */
export function PlanScreen(props: PlanScreenProps) {
  const { plan, at, actions, gestures, controls, drawer, groups, progress, view, onView } = props
  const { manage, newRailHref, root, routes, tray, zoom, zoomControl, zoomTo, real } = props
  const axis = useMemo(() => planAxis(plan, at, zoom), [plan, at, zoom])
  const board = useMemo(() => boardWritesFor(actions, gestures, controls.content), [actions, gestures, controls.content])
  const writes = useMemo(() => writesFor(controls.content), [controls.content])
  const head = (
    <PlanHead
      actions={manage}
      attention={<AttentionChip count={attentionCount(plan, attentionOf(plan))} />}
      groups={groups}
      onView={onView}
      plan={plan}
      view={view}
      zoom={zoomControl}
    />
  )
  return (
    <>
      <style>{POINTER_CSS}</style>
      <PlanPointer axisX={axisX(axis.scale, axis.range)} pxPerDay={axis.scale.pxPerDay} rung={zoom} zoomTo={zoomTo}>
        <PlanShell drawer={drawer} head={head} real={real}>
          <PlanViews
            {...board}
            at={at}
            axis={axis}
            newRailHref={controls.content.createEpic ? newRailHref : null}
            nextRailColour={nextRailColour(plan.epics.length)}
            plan={plan}
            progress={progress}
            root={root}
            routes={routes}
            tray={tray}
            view={view}
            writes={writes}
            zoom={zoom}
          />
        </PlanShell>
      </PlanPointer>
    </>
  )
}
