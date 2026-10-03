import { rungParam, type Rung } from '@repo/canvas'
import { useMemo, useState } from 'react'
import { rememberZoom } from '../../../lib/zoom-cookie'

/** The rung the canvas is drawn at, and the one way to change it, or `null` where it may not change. */
export interface ZoomState {
  readonly zoom: Rung

  /** Every zoom gesture's write: the switch, the wheel, a drill, a group chip. */
  readonly zoomTo: ((rung: string) => Promise<void>) | null
}

/**
 * The screen's zoom, as client state the browser remembers.
 *
 * It used to be a Server Action — set a cookie, revalidate the plan layout — so a flick of the wheel was a
 * round trip and a server render of the whole plan, and a click on a mark at Year was two of them before
 * its drawer opened. It is state now: a gesture sets it, the canvas redraws in the same frame, and the
 * cookie is written by the browser so the next page load opens where the reader left it (ADR 0069).
 *
 * `zoomTo` keeps the shape the gestures were written against — a string in, a promise out — and still
 * validates what it is handed, because it is reachable from anything on the page. A seat has no zoom to
 * remember and no control to change it, which is the surface's decision: `mayZoom` false answers `null`.
 *
 * @param initial - The rung the server rendered at: the reader's cookie, or the plan's own fit.
 * @param mayZoom - Whether this surface lets the reader change it.
 * @returns The rung, and the write.
 */
export function useZoom(initial: Rung, mayZoom: boolean): ZoomState {
  const [zoom, setZoom] = useState(initial)
  const zoomTo = useMemo(() => {
    if (!mayZoom) return null
    return (rung: string): Promise<void> => {
      const chosen = rungParam(rung)
      if (chosen !== null) {
        setZoom(chosen)
        rememberZoom(chosen)
      }
      return Promise.resolve()
    }
  }, [mayZoom])
  return { zoom, zoomTo }
}
