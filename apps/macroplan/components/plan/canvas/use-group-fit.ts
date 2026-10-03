import type { Rung } from '@repo/canvas'
import { useEffect, type RefObject } from 'react'
import { plainClick } from './pointer-view'
import type { Anchoring } from './use-scroll-anchor'

const CHIP = '[data-slot="group-chip"], [data-slot="group-chips"] label[data-fit-rung]'

const AT_LEFT_EDGE = 0

/** What the gesture needs: where to listen, what is drawn, and what it may ask for. */
export interface GroupFitQuery {
  readonly frame: RefObject<HTMLDivElement | null>

  /** The stop the canvas below was drawn at, so a chip asking for the same one writes nothing. */
  readonly rung: Rung

  readonly anchor: Anchoring

  /** The zoom write, or `null` on a surface that cannot remember one. */
  readonly zoomTo: ((rung: string) => Promise<void>) | null
}

const askedBy = (target: Element | null): { readonly rung: string; readonly day: number } | null => {
  const chip = target?.closest(CHIP) ?? null
  const rung = chip?.getAttribute('data-fit-rung') ?? null
  const day = Number(chip?.getAttribute('data-fit-day'))
  return rung === null || !Number.isFinite(day) ? null : { rung, day }
}

/**
 * Fits the timeline to a group when its chip is clicked: the stop it fits at, scrolled to its start.
 *
 * ### What it does not touch
 *
 * The selection. A chip is a `<label>` for a radio, and the dimming is a generated rule keyed on the
 * group the shell says is chosen (`../shell/plan-shell.tsx`), so choosing a group costs no round trip
 * (ADR 0064, ADR 0069) — and none of that is this hook's. Nothing here calls `preventDefault`, which is load-bearing rather than incidental: the
 * label's default action is to check its own radio, and suppressing it would make the click that
 * moved the view fail to select the group it moved to.
 *
 * The order falls out correctly on its own. The browser checks the radio as the default action, so
 * the plan is already dimmed to the group by the time the server answers with a redraw at the new
 * stop.
 *
 * ### Where the decision was made
 *
 * Not here. `labels/group-fit.ts` works out, on the server, which stop each group fits at and which
 * day it opens on, and writes both onto the chip. This reads them back with `closest()`, which is the
 * same shape `data-detail` and `data-hover-id` already have and for the same reason: a client
 * component under `components/plan` may be handed primitives, unbound functions, `null` and markup on
 * `children`, and a map of groups is none of those (`../module-boundaries.test.tsx`).
 *
 * So what is left here is a listener, two attribute reads, and the choice between the anchor's two
 * halves — which is the whole of the client-side cost of the feature.
 *
 * ### Why a chip with no fit does nothing
 *
 * A group holding no features, or only features the forward pass could not place, has no window to
 * fit to. It carries neither attribute, this answers `null`, and the click selects without moving —
 * which is the honest outcome. Scrolling to day zero would read as the plan jumping for no reason.
 *
 * ### Why a native listener and not `onClick`
 *
 * The root's own `onClick` is the drill gesture, which returns early at the finest stop and for a
 * click that is not on a bar. Folding a second, unrelated question into it would make one handler
 * answer two, and the guards are not the same ones — a chip is worth acting on at every stop.
 */
export function useGroupFit({ frame, rung, anchor, zoomTo }: GroupFitQuery): void {
  useEffect(() => {
    const root = frame.current
    if (root === null) return undefined
    const onClick = (event: MouseEvent): void => {
      if (!plainClick(event)) return
      const asked = askedBy(event.target instanceof Element ? event.target : null)
      if (asked === null) return
      if (asked.rung === rung) {
        anchor.now(asked.day, AT_LEFT_EDGE)
        return
      }
      if (zoomTo === null) return
      anchor.after(asked.day, AT_LEFT_EDGE)
      void zoomTo(asked.rung)
    }
    root.addEventListener('click', onClick)
    return () => {
      root.removeEventListener('click', onClick)
    }
  }, [anchor, frame, rung, zoomTo])
}
