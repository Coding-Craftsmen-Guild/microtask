import type { DayRange, PlanScale, Rung } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'
import { CanvasBoard } from './canvas-board'
import { DragRoot, type FeaturePlace } from './drag-root'
import { ExtendRoot } from './extend-root'
import { mayExtend, type ExtendWrites } from './extend-write'
import { axisX, canvasLayout, CANVAS_RANGE, CANVAS_SCALE, type Counted } from './view'

const NOTHING_OPENS = (): null => null

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

  /** The writes a draw from a mark's own end sends; omitted for a surface that may create nothing. */
  readonly draw?: ExtendWrites

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
 */
export function PlanCanvas({
  plan,
  at,
  place,
  draw = NO_WRITES,
  progress = [],
  range = CANVAS_RANGE,
  scale = CANVAS_SCALE,
  rung = 'feature',
  hrefOf = NOTHING_OPENS,
}: PlanCanvasProps) {
  const mayDraw = mayExtend(draw)
  const layout = canvasLayout({ plan, range, scale, rung, progress, hrefOf })
  const board = <CanvasBoard at={at} layout={layout} plan={plan} range={range} scale={scale} />
  return (
    <DragRoot
      axisX={axisX(scale, range)}
      gutter={scale.gutter}
      place={place}
      planId={plan.id}
      pxPerDay={scale.pxPerDay}
    >
      {mayDraw ? (
        <ExtendRoot
          createFeature={draw.createFeature}
          createItem={draw.createItem}
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
