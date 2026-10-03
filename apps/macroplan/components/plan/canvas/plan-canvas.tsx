import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { CanvasBoard } from './canvas-board'
import { DragRoot, type FeaturePlace, type ItemPlace } from './drag-root'
import { ExtendRoot } from './extend-root'
import type { DrawGesture } from '../store/gestures'
import { maySize, type SizeWrites } from './size-write'
import {
  axisX,
  canvasLayout,
  CANVAS_RANGE,
  CANVAS_SCALE,
  type CanvasLayout,
  type CanvasQuery,
  type Counted,
} from './view'

const NOTHING_OPENS = (): null => null

const NO_SIZES: SizeWrites = { estimateFeature: null, estimateItem: null }

const drawnLayout = (given: CanvasLayout | undefined, query: CanvasQuery): CanvasLayout =>
  given ?? canvasLayout(query)

const gesturesOn = (draw: DrawGesture | null, size: SizeWrites, points: boolean): boolean =>
  !points && (draw !== null || maySize(size))

/** Props for {@link PlanCanvas}. */
export interface PlanCanvasProps {
  /** The plan to draw. */
  readonly plan: PlanScreenModel

  /** What the bridge says about each item, which widens a mark's treatment. */
  readonly progress?: Counted

  /** Now, for the today line. */
  readonly at: Date

  /** The window of days drawn. */
  readonly range?: DayRange

  /** What a day is worth in px. */
  readonly scale?: PlanScale

  /** Which rung: bars, or lines with their items under them. */
  readonly rung?: Rung

  /** The placement write a drag sends, or `null` for a surface that may not move work. */
  readonly place: FeaturePlace | null

  /**
   * What a draw from a mark's own end does — the draw gesture (`../store/gestures.ts`) — or `null` / omitted
   * for a surface that may create nothing.
   */
  readonly draw?: DrawGesture | null

  /**
   * The write a dragged **item** sends, or `null` / omitted on a surface that may not move one.
   *
   * Its own prop now that the draw is a gesture rather than a record of raw writes: it used to be read off
   * that record because the same action served both, and the item drag needs the optimistic one, which moves
   * the mark the moment it is dropped.
   */
  readonly placeItem?: ItemPlace | null

  /**
   * The two writes a **resize** sends, omitted for a surface that may change no estimate.
   *
   * Beside {@link PlanCanvasProps.draw} rather than inside it, because the two gestures are two sets of
   * permissions: a seat may be allowed to draw new work and not to re-estimate what is there, or the
   * reverse. One record would make the pair of capabilities a single answer.
   */
  readonly size?: SizeWrites

  /** Where a bar opens. */
  readonly hrefOf?: (featureId: string) => string | null

  /**
   * The layout, when the board has already worked it out for its rail column (`../board/use-board-layout.ts`);
   * omitted, the canvas works it out itself from the props above.
   */
  readonly layout?: CanvasLayout
}

/**
 * The timeline: rails of bars, the arcs between them, and the two gestures over them.
 *
 * The SVG is a Server Component of up to two thousand nodes and stays one (`./canvas-board.tsx`). Both
 * gestures are client elements **around** it rather than islands inside it: `./drag-root.tsx` moves a bar
 * that already exists, and `./extend-root.tsx` draws one that does not. The draw root is nested inside the
 * drag root so a pointer down on a handle stops there — the handle sits inside the bar it extends, and
 * without that one gesture would start the other as well.
 *
 * A surface that may create nothing gets no draw root and no handles at all, which is a rendering answer
 * and not a gate: there is nothing for the gesture to do, and the actions are still what refuse a write.
 *
 * ### Why the stops that draw a point get no draw root either
 *
 * A handle sits on each end of the mark it extends, and at Year and Quarter the mark is a nine-pixel dot
 * (`./rung-view.ts`): both handles land **on** the dot, covering it and each other. They take the pointer
 * as well, so the one thing a reader gets from hovering a point — the card naming it, which is the only
 * place its name appears when the board is too crowded to label it — never appeared at all.
 *
 * Two marks' worth of gesture cannot share nine pixels, so the stop that cannot hold both drops the one a
 * reader can get elsewhere: drawing stays at Sprint, where a mark has two ends far enough apart to grab,
 * and the strip's Feature pill still drops new work at any stop.
 */
export function PlanCanvas({
  plan,
  at,
  place,
  draw = null,
  placeItem = null,
  size = NO_SIZES,
  progress = [],
  range = CANVAS_RANGE,
  scale = CANVAS_SCALE,
  rung = 'feature',
  hrefOf = NOTHING_OPENS,
  layout: given,
}: PlanCanvasProps) {
  const layout = drawnLayout(given, { plan, range, scale, rung, progress, hrefOf })
  const mayDraw = gesturesOn(draw, size, layout.frame.draws.points)
  const board = <CanvasBoard at={at} layout={layout} plan={plan} range={range} scale={scale} />
  return (
    <DragRoot
      axisX={axisX(scale, range)}
      gutter={scale.gutter}
      place={place}
      placeItem={placeItem}
      planId={plan.id}
      pxPerDay={scale.pxPerDay}
    >
      {mayDraw ? (
        <ExtendRoot
          draw={draw}
          estimateFeature={size.estimateFeature}
          estimateItem={size.estimateItem}
          gutter={scale.gutter}
          planId={plan.id}
          pxPerDay={scale.pxPerDay}
          sprintLengthDays={plan.sprintLengthDays}
        >
          {board}
        </ExtendRoot>
      ) : (
        board
      )}
    </DragRoot>
  )
}
