import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { CanvasBoard } from './canvas-board'
import { DragRoot, type FeaturePlace } from './drag-root'
import { ExtendRoot } from './extend-root'
import { mayExtend, type ExtendWrites } from './extend-write'
import { maySize, type SizeWrites } from './size-write'
import { axisX, canvasLayout, CANVAS_RANGE, CANVAS_SCALE, type Counted } from './view'

const NOTHING_OPENS = (): null => null

const NO_SIZES: SizeWrites = { estimateFeature: null, estimateItem: null }

const gesturesOn = (draw: ExtendWrites, size: SizeWrites, points: boolean): boolean =>
  !points && (mayExtend(draw) || maySize(size))

const NO_WRITES: ExtendWrites = {
  createFeature: null,
  createItem: null,
  labelFeature: null,
  placeFeature: null,
  placeItem: null,
  setDependencies: null,
}

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
   * The writes a draw from a mark's own end sends; omitted for a surface that may create nothing.
   *
   * Its `placeItem` is also what lets an **item** be dragged to another feature, which is the one member
   * two gestures share. It is read from here rather than threaded down beside `place` as a sixth prop
   * because it is the same action under the same permission: a surface that may reorder a feature's items
   * may do it by drawing one at a place or by dragging one there, and two props would be two chances to
   * hand over one and forget the other.
   */
  readonly draw?: ExtendWrites

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
  draw = NO_WRITES,
  size = NO_SIZES,
  progress = [],
  range = CANVAS_RANGE,
  scale = CANVAS_SCALE,
  rung = 'feature',
  hrefOf = NOTHING_OPENS,
}: PlanCanvasProps) {
  const layout = canvasLayout({ plan, range, scale, rung, progress, hrefOf })
  const mayDraw = gesturesOn(draw, size, layout.frame.draws.points)
  const board = <CanvasBoard at={at} layout={layout} plan={plan} range={range} scale={scale} />
  return (
    <DragRoot
      axisX={axisX(scale, range)}
      gutter={scale.gutter}
      place={place}
      placeItem={draw.placeItem}
      planId={plan.id}
      pxPerDay={scale.pxPerDay}
    >
      {mayDraw ? (
        <ExtendRoot
          createFeature={draw.createFeature}
          createItem={draw.createItem}
          estimateFeature={size.estimateFeature}
          estimateItem={size.estimateItem}
          gutter={scale.gutter}
          labelFeature={draw.labelFeature}
          placeFeature={draw.placeFeature}
          placeItem={draw.placeItem}
          planId={plan.id}
          pxPerDay={scale.pxPerDay}
          setDependencies={draw.setDependencies}
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
