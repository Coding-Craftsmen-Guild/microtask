import type { Rung } from '@repo/canvas'
import type { CreateWrites } from './create-write'
import type { BoardWrites } from '../table/table-writes'
import type { ReactNode } from 'react'
import type { PlanAxis } from '../canvas/zoom-view'
import type { Counted } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { CreateRoot } from './create-root'
import { CreateStrip } from './create-strip'
import { PlanBoard } from './plan-board'

/** Props for {@link TimelinePanel}. */
export interface TimelinePanelProps extends BoardWrites {
  readonly plan: PlanScreenModel

  readonly at: Date

  readonly zoom: Rung

  /** The scale and window the board is drawn at, worked out once for the screen. */
  readonly axis: PlanAxis

  readonly progress: Counted

  /** The features with no bar, under the board. */
  readonly tray: ReactNode

  /** The plan id or the seat token, whichever roots this surface's URLs. */
  readonly root: string

  readonly routes: DrawerRoutes

  /** The hue to propose for a dropped rail, chosen on the server from how many the plan holds. */
  readonly nextRailColour: string
}

/** Whether anything may be dropped on the board at all, which is what decides the strip and its root exist. */
export const anyAdd = (adds: CreateWrites): boolean =>
  adds.draw !== null || adds.dropRail !== null || adds.reorderEpic !== null

/**
 * The timeline as a whole: what can be added, the board it is added to, and what has no bar.
 *
 * ### Why the strip is outside the drop root and the board is inside it
 *
 * The strip is the source of a drag and the board is its target, and the two have different jobs:
 * the strip must stay put while the plan scrolls under it, and the root must be the box the preview
 * is positioned inside. Wrapping both would make the strip part of the drop surface, so a pill let go
 * of over its own row would land on whatever lane happened to be under the strip.
 *
 * ### Why a viewer with no writes gets the board without a root at all
 *
 * Not a root that refuses: a `dragover` handler that never cancels is a drop target in the markup and
 * nowhere else, and the one thing worse than a control that is absent is one that is present and
 * silent. A seat that may add nothing gets exactly the board, which is what it had.
 */
export function TimelinePanel(props: TimelinePanelProps) {
  const { plan, at, zoom, axis, progress, place, placeItem, draw, size, tray, root, routes, adds, offers, nextRailColour } = props
  const board = (
    <PlanBoard
      at={at}
      draw={draw}
      place={place}
      placeItem={placeItem}
      size={size}
      mayReorder={adds.reorderEpic !== null}
      plan={plan}
      progress={progress}
      range={axis.range}
      root={root}
      routes={routes}
      rung={zoom}
      scale={axis.scale}
    />
  )
  if (!anyAdd(adds)) return <>{board}{tray}</>
  return (
    <>
      <CreateStrip
        mayAddEpic={offers.epic}
        mayAddFeature={offers.feature}
        mayAddItem={offers.item}
      />
      <CreateRoot
        draw={adds.draw}
        dropRail={adds.dropRail}
        gutter={axis.scale.gutter}
        nextRailColour={nextRailColour}
        planId={plan.id}
        pxPerDay={axis.scale.pxPerDay}
        reorderEpic={adds.reorderEpic}
        sprintLengthDays={plan.sprintLengthDays}
        startDate={plan.startDate}
        timezone={plan.timezone}
      >
        {board}
      </CreateRoot>
      {tray}
    </>
  )
}
