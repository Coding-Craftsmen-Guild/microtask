import type { Rung } from '@repo/canvas'
import { chooseZoom } from '../../../actions/zoom'
import { ZOOM_ORDER, ZOOM_WORDS } from './zoom-view'

const ROW = 'flex items-center'

const LEGEND = 'sr-only'

const GROUP = 'flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5'

const CHOSEN =
  'cursor-default rounded-[5px] bg-background px-2.5 text-[12px] leading-6 font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]'

const OFFERED =
  'cursor-pointer rounded-[5px] px-2.5 text-[12px] leading-6 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand'

/** Props for {@link ZoomSwitch}. */
export interface ZoomSwitchProps {
  readonly zoom: Rung
}

/**
 * How much time is on screen: a year, a quarter or a sprint.
 *
 * ### Why the chosen one looks the way it does
 *
 * It is a raised tile in a sunken group, which is what the view tabs beside it are and what both
 * reference tools use for a segmented control. The first revision gave the chosen stop `bg-card` and
 * a `ring-1`, and gave every other stop a `ring-1` as well — on a white page `bg-card` *is* the page,
 * so all three rendered as identical outlined pills and the control never said which one was on.
 *
 * ### Why the chosen one is not a button
 *
 * Pressing it would submit the zoom the page is already drawn at. A `<span>` says the same thing to a
 * pointer, to a keyboard and to a screen reader — `aria-current` carries the state — without offering
 * a round trip that changes nothing.
 *
 * ### Why the legend is off screen
 *
 * It read `Zoom` in 12px muted beside the control, and it is three stops labelled `Year`, `Quarter`
 * and `Sprint` in a segmented control at the end of a toolbar: nobody who can see it needs to be told
 * what it is. A reader who cannot still does — `aria-describedby` on each stop points at it — so the
 * word stays in the accessibility tree and leaves the row, which is what `sr-only` is for.
 */
export function ZoomSwitch({ zoom }: ZoomSwitchProps) {
  return (
    <form action={chooseZoom} className={ROW} data-slot="zoom-switch">
      <span className={LEGEND} id="plan-zoom-legend">
        Zoom
      </span>
      <div className={GROUP}>
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
      </div>
    </form>
  )
}
