import type { RailBox } from '@repo/canvas'
import { FeatureLine } from './feature-line'
import { FeaturePointMark } from './feature-point'
import { pointX } from './mark-metrics'
import { hueOf } from './view'
import type { RailFrame } from './view'

const LINK = 'outline-none [&>*]:transition-opacity hover:[&>*]:opacity-80 [[data-drag=true]_&]:cursor-grab'

/** Props for {@link RailFeatures}. */
export interface RailFeaturesProps {
  readonly rail: RailBox

  readonly frame: RailFrame

  readonly top: number

  /**
   * How far across the canvas is drawn, which is the room the **last** point on a rail has.
   *
   * A point's label is budgeted against the gap to the next mark beside it (`./feature-point.tsx`),
   * and the last mark on a rail has no next one. The bled width is the honest answer for it: there is
   * genuinely nothing to its right until the canvas ends.
   */
  readonly drawnWidth: number
}

const roomFor = (rail: RailBox, at: number, drawnWidth: number): number => {
  const here = rail.bars[at]
  const next = rail.bars[at + 1]
  if (here === undefined) return 0
  return (next === undefined ? drawnWidth : pointX(next)) - pointX(here)
}

/**
 * Every placed feature on one rail: a point at the wider stops, a line and two diamonds at the Sprint
 * stop.
 *
 * ### The names are back, and the budget is why
 *
 * There was a `<text>` beside every bar, cut to a budget worked out against the gap to the next one,
 * and the whole mechanism was removed with the flat rule **the canvas draws geometry and never
 * text**. That rule was right for what the canvas then was: a 14px-a-day finest stop, where a budget
 * was routinely zero or wide enough to print over the neighbour.
 *
 * The Sprint stop is 40px a day now and draws **item** bars, which are 80px for a two-day item. So a
 * name fits where the plan is read closely, and `./mark-label.ts` is what keeps that from degrading:
 * the budget is the mark's own width, and below six characters a mark gets no label at all rather
 * than one clipped letter. What a reader loses is nothing; what they gain is a board that can be read
 * without a pointer.
 *
 * At the two point stops the budget is the **gap to the next mark** instead, which {@link roomFor}
 * measures: a point is nine pixels wide at every zoom, so a budget read off the mark would drop every
 * name at every stop, where the air beside it is exactly what grows as a reader zooms in. This
 * component measures it because it is the only one holding a rail's marks in their order.
 *
 * The hover card and the table are unchanged and still name whatever is pointed at or listed, which
 * is what a mark too narrow for a label falls back to.
 *
 * ### Why a bar is a link, and why it is out of the tab order
 *
 * Clicking a mark opens its drawer, which is the thing a person tries first on a chart like this. It
 * is a real `<a href>` rather than a click handler, so it middle-clicks, it can be opened in a new
 * tab, and it needs no JavaScript.
 *
 * It carries `tabIndex={-1}` because the canvas is `role="img"`, and that role prunes its whole
 * subtree from the accessibility tree: a focusable descendant of it is a stop a keyboard lands on and
 * a screen reader can say nothing about. The keyboard path to the same drawer is the table, where
 * every feature is a named row header — the same argument `drag-root.tsx` makes for its drag, whose
 * keyboard equivalent is the drawer's own Move controls.
 *
 * It also says so under the pointer. The grab cursor is scoped to a frame that actually listens —
 * `DragRoot` sets `data-drag` — so a read-only seat shows the link cursor and does not promise a
 * gesture it would refuse.
 */
export function RailFeatures({ rail, frame, top, drawnWidth }: RailFeaturesProps) {
  if (!frame.draws.points && !frame.draws.lines) return null
  return (
    <>
      {rail.bars.map((bar, at) => {
        const shared = {
          bar,
          colour: hueOf(frame, bar.id, rail.colour),
          detail: frame.details.get(bar.id) ?? null,
          hoverId: bar.id,
          labelId: frame.groups.get(bar.id) ?? null,
          name: frame.names.get(bar.id) ?? '',
          top,
          treatment: frame.treatments.get(bar.id) ?? ('solid' as const),
        }
        const href = frame.hrefOf(bar.id)
        const mark = frame.draws.lines ? (
          <FeatureLine {...shared} />
        ) : (
          <FeaturePointMark {...shared} room={roomFor(rail, at, drawnWidth)} />
        )
        return (
          <g data-search={frame.search.get(bar.id)} data-slot="feature-group" key={bar.id}>
            {href === null ? (
              mark
            ) : (
              <a className={LINK} data-slot="feature-link" href={href} tabIndex={-1}>
                {mark}
              </a>
            )}
          </g>
        )
      })}
    </>
  )
}
