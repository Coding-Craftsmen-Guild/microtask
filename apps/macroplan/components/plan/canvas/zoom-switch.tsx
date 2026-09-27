import type { Rung } from '@repo/canvas'
import { chooseZoom } from '../../../actions/zoom'
import { ZOOM_ORDER, ZOOM_WORDS } from './zoom-view'

const ROW = 'flex flex-wrap items-center gap-1.5'

const LEGEND = 'text-[13px] text-muted-foreground'

const CHOSEN =
  'cursor-default rounded-lg bg-card px-3 py-1.5 text-[13px] font-semibold text-foreground ring-1 ring-foreground/10'

const OFFERED =
  'cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-semibold text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-brand'

/** Props for {@link ZoomSwitch}. */
export interface ZoomSwitchProps {
  /** The rung the canvas beside this is drawing at, so the control marks it. */
  readonly zoom: Rung
}

/**
 * How far out to stand: §5's three rungs, as three buttons over one Server Action.
 *
 * ### Why this exists at all
 *
 * Through phase 4 the canvas drew one fixed 60-working-day window, so of §5's three detail levels
 * exactly one was reachable and the epic rung — the one the whole git-graph shape was designed for —
 * could not be seen in the product. `plan-canvas.tsx` recorded the gap as "phase 3's zoom and pan will
 * pass them", and phase 3 did not.
 *
 * ### A form, not radios
 *
 * The view switch beside this is two radios and no JavaScript, and that works because both its panels
 * are already rendered — switching hides one with CSS. A rung cannot be done that way: the three differ
 * in `pxPerDay`, in what chrome is drawn, and in whether a feature is a bar or a node, so CSS would have
 * to be given all three canvases to choose between. The table and the canvas are already both always
 * mounted (ADR 0056), and two more canvases is the doubling `item-mark.tsx` exists to refuse. So the
 * server re-renders one canvas, and the switch is a form.
 *
 * ### The chosen rung is not a button
 *
 * It is a `<span aria-current="true">`, so the control has two buttons and not three: a submit that sets
 * the rung already set is a round trip that redraws the same canvas. It also gives a screen reader the
 * one word that matters — which of the three is on — rather than three interchangeable buttons.
 *
 * `name="rung"` on each button is what `chooseZoom` reads. One unbound action over one form, rather than
 * three `bind` calls, for the reason that action's own note gives: a `bound ` prefix is the signal ADR
 * 0040 reserves for a token reaching a component, and a zoom level is not one.
 */
export function ZoomSwitch({ zoom }: ZoomSwitchProps) {
  return (
    <form action={chooseZoom} className={ROW}>
      <span className={LEGEND} id="plan-zoom-legend">
        Zoom
      </span>
      {ZOOM_ORDER.map((rung) =>
        rung === zoom ? (
          <span aria-current="true" className={CHOSEN} key={rung}>
            {ZOOM_WORDS[rung]}
          </span>
        ) : (
          <button
            aria-describedby="plan-zoom-legend"
            className={OFFERED}
            key={rung}
            name="rung"
            type="submit"
            value={rung}
          >
            {ZOOM_WORDS[rung]}
          </button>
        ),
      )}
    </form>
  )
}
