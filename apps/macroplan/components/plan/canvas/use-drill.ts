import type { Rung } from '@repo/canvas'
import { usePlanNav } from '../nav/plan-nav'
import { useCallback } from 'react'
import type { Anchoring } from './use-scroll-anchor'

const DATED = '[data-start-day]'

const FINEST: Rung = 'item'

/**
 * How far into the pane a drilled-to mark is put, in px.
 *
 * Not zero. A feature landing hard against the left edge loses the days before it, and those are what
 * say whether anything was waiting on it — the arc arriving from the rail above comes in from the left
 * and would be scrolled off with them. Three sprints of the Sprint stop's own axis is enough to keep
 * that approach on screen without pushing the mark itself into the middle of the pane.
 */
export const DRILL_INSET = 120

const startDayOf = (target: Element | null): number | null => {
  const read = Number(target?.closest(DATED)?.getAttribute('data-start-day'))
  return Number.isFinite(read) ? read : null
}

/** What a drill needs: the stop it leaves from, where to land, and the write that changes the stop. */
export interface DrillQuery {
  /** The rung the canvas below was drawn at, which is what decides there is anything to drill. */
  readonly rung: Rung

  readonly anchor: Anchoring

  /** The zoom write, or `null` on a surface that cannot remember one. */
  readonly zoomTo: ((rung: string) => Promise<void>) | null
}

/**
 * Opening a mark from a stop that is not the finest: zoom in, land on it, then open it.
 *
 * ### Why it drills at all
 *
 * The two wider stops draw a feature as a **point** (`./rung-view.ts`), which says where the work is
 * and not how long it runs. So the first thing a click there means is "show me this properly", and
 * the finest rung — not one step finer — is what shows it: the span as a line, its items as bars
 * under it, each named. The drawer then opens over a canvas already drawn at that rung, which is why
 * the write is awaited before the route is pushed.
 *
 * ### Why it scrolls, and why the scroll outlives the call
 *
 * Sprint is ten times the Year stop's scale. A mark clicked at day 90 is 360px along the axis it was
 * clicked on and 3,780px along the one that replaces it, so the drill used to land on a pane still
 * showing day zero with the feature the reader had just pointed at a scrollbar away — the zoom
 * worked and looked like it had thrown them somewhere else.
 *
 * The day comes off the mark's own `data-start-day`, which every mark at every stop already carries
 * for the draw gesture. It is spent through {@link Anchoring.after} rather than by scrolling here,
 * because the canvas to scroll does not exist yet: the new scale arrives as a prop after the server
 * has redrawn, and `./use-scroll-anchor.ts` holds the day until it does. Using that one anchor is
 * also what stops this, the wheel and the group chips ending up with three ideas of where the pane
 * should be.
 *
 * At the finest stop there is nothing to drill and nothing to re-anchor, so the click is a plain
 * open and the pane does not move.
 *
 * @param query - The stop, the anchor and the zoom write.
 * @returns Open this route, having first drilled to the mark the click landed on.
 */
export function useDrill(query: DrillQuery): (href: string, target: Element | null) => void {
  const { rung, anchor, zoomTo } = query
  const { go } = usePlanNav()
  return useCallback(
    (href: string, target: Element | null): void => {
      const drilled = async (): Promise<void> => {
        if (zoomTo !== null && rung !== FINEST) {
          const day = startDayOf(target)
          if (day !== null) anchor.after(day, DRILL_INSET)
          await zoomTo(FINEST)
        }
        go(href)
      }
      void drilled()
    },
    [anchor, go, rung, zoomTo],
  )
}
