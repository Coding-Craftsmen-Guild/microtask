import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import { useMemo } from 'react'
import type { DrawerRoutes } from '../../../lib/drawer-routes'
import { attentionOf } from '../attention/attention'
import { canvasLayout, type CanvasLayout, type Counted } from '../canvas/view'
import type { PlanScreenModel } from '../plan-screen-model'
import { boardRails, type BoardRail } from './board-rows'

/** What the board lays out from: the plan, the axis it is drawn on, and where a bar opens. */
export interface BoardLayoutQuery {
  readonly plan: PlanScreenModel
  readonly range: DayRange
  readonly scale: PlanScale
  readonly rung: Rung
  readonly progress: Counted
  readonly root: string
  readonly routes: DrawerRoutes
}

/** The canvas's layout, and the rail column's rows read off the same rails. */
export interface BoardLayout {
  readonly layout: CanvasLayout
  readonly rails: readonly BoardRail[]
}

/**
 * The board's layout, worked out once per change of what it depends on.
 *
 * The rail column and the canvas both draw from `railLayout`, and each used to call it — the column here,
 * the canvas inside `canvasLayout` — which was harmless while the server drew the board once per request.
 * The board is drawn in the browser now and re-drawn on every edit and every zoom (ADR 0069), so the one
 * layout is computed here, memoised on what it reads, and handed to both: the two still agree by
 * construction, and a hover, a drawer or a keystroke in the filter recomputes nothing.
 *
 * @param query - The plan, the axis and the routes.
 * @returns The canvas's layout and the column's rows.
 */
export function useBoardLayout(query: BoardLayoutQuery): BoardLayout {
  const { plan, range, scale, rung, progress, root, routes } = query
  return useMemo(() => {
    const hrefOf = (featureId: string): string => routes.feature(root, featureId)
    const layout = canvasLayout({ plan, range, scale, rung, progress, hrefOf })
    return { layout, rails: boardRails(plan, layout.rails, attentionOf(plan)) }
  }, [plan, range, scale, rung, progress, root, routes])
}
