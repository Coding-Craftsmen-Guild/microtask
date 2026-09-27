import type { PlanBridge } from '@repo/api-client'
import type { Rung } from '@repo/canvas'
import { PlanCanvas } from './canvas/plan-canvas'
import type { FeaturePlace } from './canvas/drag-root'
import { ZoomSwitch } from './canvas/zoom-switch'
import { ZOOM_VIEW } from './canvas/zoom-view'
import type { PlanScreenModel } from './plan-screen-model'
import { PlanTable } from './table/plan-table'
import { VIEW_SWITCH } from './view-switch'

/** Props for {@link PlanViews}: the two renderings of one plan, and the zoom they are drawn at. */
export interface PlanViewsProps {
  /** The plan, already reduced so its type cannot hold a share token (ADR 0033). */
  readonly plan: PlanScreenModel

  /** The instant the today line is drawn at, read once by the page. */
  readonly at: Date

  /** Which of §5's three rungs to draw at. */
  readonly zoom: Rung

  /** What each linked item's task counts, from the bridge read. */
  readonly progress: PlanBridge['items']

  /** The drop handler, or `null` where this reader may not place a feature. */
  readonly place: FeaturePlace | null
}

/**
 * The zoom control and the two renderings of a plan: the timeline, and the table beside it.
 *
 * ### It returns a fragment, and that is load-bearing
 *
 * `VIEW_SWITCH` is a two-radio switch with no JavaScript, and it works by `peer-*` — a **sibling**
 * selector. `view-switch.ts` is explicit that this rules out wrapping any part of it: "the markup of the
 * radios, their labels and both panels has to stay one flat list of siblings … a component drawn around
 * any part of it is the wrapper the paragraph above rules out."
 *
 * A fragment is not a wrapper. It renders no DOM node, so the scroller and the table panel arrive as
 * siblings of the two radios exactly as if they had been written in `PlanScreen` itself, and
 * `peer-checked/table:hidden` still selects them. **Anything here becoming a `<div>` breaks the switch
 * silently** — both panels would simply stop hiding, with nothing failing anywhere.
 *
 * ### Why this file exists
 *
 * `plan-screen.tsx` predicted it: "the next thing to give way, if a fifth slot ever arrives, is the grid
 * wrapper and the slot order — `./plan-body.tsx` taking the three `ReactNode`s and the two panels." A
 * fifth slot did arrive, and then the zoom switch put `PlanScreen` over ADR 0027's fifty-line function
 * cap. This is that split, made at the panels rather than at the grid, because the grid is three slots in
 * a row and the panels are the part with an argument attached.
 *
 * ### The range and the scale are looked up here, not passed in
 *
 * One rung crosses in and `ZOOM_VIEW` composes both from it, so nothing above can hand this a range that
 * lands on a different rung than the switch beside it displays. `zoom-view.ts` holds the three.
 */
export function PlanViews({ plan, at, zoom, progress, place }: PlanViewsProps) {
  return (
    <>
      <ZoomSwitch zoom={zoom} />
      <div className={VIEW_SWITCH.scroller}>
        <PlanCanvas
          at={at}
          place={place}
          plan={plan}
          progress={progress}
          range={ZOOM_VIEW[zoom].range}
          scale={ZOOM_VIEW[zoom].scale}
        />
      </div>
      <div className={VIEW_SWITCH.tablePanel}>
        <PlanTable plan={plan} progress={progress} />
      </div>
    </>
  )
}
