import type { RailBox } from '@repo/canvas'
import { FeatureBarMark } from './feature-bar'
import { FeatureNode } from './feature-node'
import { hueOf } from './view'
import type { RailFrame } from './view'

const LINK = 'outline-none [&>*]:transition-opacity hover:[&>*]:opacity-80 [[data-drag=true]_&]:cursor-grab'

/** Props for {@link RailFeatures}. */
export interface RailFeaturesProps {
  readonly rail: RailBox

  readonly frame: RailFrame

  readonly top: number
}

/**
 * Every placed feature on one rail, as a mark and nothing else.
 *
 * ### Why there is no name here
 *
 * There was one: a `<text>` beside each mark, cut to a budget `barLabels` worked out from the bar's
 * width and the gap to the next one. The whole mechanism is gone, and the rule it leaves behind is
 * flat — **the canvas draws geometry and never text**.
 *
 * What a reader loses is naming a bar by looking at it. What answers that instead was already built
 * three times over: the rail tree names every feature, the table names every feature and item in a
 * cell with a header, and the hover card names whatever the pointer is on. The card is why this is a
 * trade rather than a loss, and why `canvas/pointer-css.ts` stopped truncating its title.
 *
 * What it gains is one fewer element per feature on a surface whose element count grows with the
 * plan, and an end to deciding how much of a name fits — a question with no good answer at four
 * pixels a day, where a label budgeted against the gap to the next dot was cut to nothing or drawn
 * over it.
 *
 * ### Why a bar is a link, and why it is out of the tab order
 *
 * Clicking a bar opens its drawer, which is the thing a person tries first on a chart like this and
 * which the first revision did not do at all. It is a real `<a href>` rather than a click handler, so
 * it middle-clicks, it can be opened in a new tab, and it needs no JavaScript.
 *
 * It carries `tabIndex={-1}` because the canvas is `role="img"`, and that role prunes its whole
 * subtree from the accessibility tree: a focusable descendant of it is a stop a keyboard lands on and
 * a screen reader can say nothing about. The keyboard path to the same drawer is the sidebar tree,
 * where every feature is a named link — the same argument `drag-root.tsx` makes for its drag, whose
 * keyboard equivalent is the drawer's own Move controls.
 *
 * It also says so under the pointer. The first revision gave a bar no cursor, no hover and no focus
 * treatment at all: it was draggable and clickable and signalled neither, so the only feedback was
 * the ghost that appears once a drag is already under way. The grab cursor is scoped to a frame that
 * actually listens — `DragRoot` sets `data-drag` — so a read-only seat shows the link cursor and does
 * not promise a gesture it would refuse.
 *
 * ### Why the Year rung draws a dot
 *
 * At four pixels a day a span is meaningless, so a feature there is a point at the day it starts
 * rather than a bar claiming a width nobody can read. The rung is a rollup, and the names column
 * beside it still says which rail each row is — which is the question that rung answers.
 */
export function RailFeatures({ rail, frame, top }: RailFeaturesProps) {
  if (!frame.draws.bars && !frame.draws.nodes) return null
  return (
    <>
      {rail.bars.map((bar) => {
        const shared = {
          bar,
          colour: hueOf(frame, bar.id, rail.colour),
          detail: frame.details.get(bar.id) ?? null,
          hoverId: bar.id,
          labelId: frame.groups.get(bar.id) ?? null,
          top,
          treatment: frame.treatments.get(bar.id) ?? ('solid' as const),
        }
        const href = frame.hrefOf(bar.id)
        const mark = frame.draws.nodes ? (
          <FeatureNode {...shared} />
        ) : (
          <FeatureBarMark {...shared} />
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
