import type { RailBox } from '@repo/canvas'
import { BarLabelText } from './bar-label'
import { FeatureBarMark } from './feature-bar'
import { FeatureNode } from './feature-node'
import type { RailFrame } from './view'

const LINK = 'outline-none [&>*]:transition-opacity hover:[&>*]:opacity-80 [[data-drag=true]_&]:cursor-grab'

/** Props for {@link RailFeatures}. */
export interface RailFeaturesProps {
  readonly rail: RailBox

  readonly frame: RailFrame

  readonly top: number
}

/**
 * Every placed feature on one rail, each with its name.
 *
 * The mark and its label are siblings rather than the label being inside the mark's component: a
 * `<rect>` cannot contain a `<text>`, and the two want different parents in the one case where the
 * mark is a `<polygon>`. Keeping them as a pair here also means the label is drawn *after* its bar
 * in document order, which is what puts it on top without a `z-index` SVG does not have.
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
 * ### Why the node rung is unlabelled
 *
 * At the Year rung a feature is a dot, not a bar, because four pixels a day makes a span meaningless
 * — and it makes the gaps between spans meaningless too. `barLabels` budgets an outside label
 * against the distance to the next bar, so at that scale every label on a busy rail would be cut to
 * nothing or, worse, drawn over the next dot. The rung is a rollup; the names column beside it still
 * says which rail each row is, which is the question that rung answers.
 */
export function RailFeatures({ rail, frame, top }: RailFeaturesProps) {
  if (!frame.draws.bars && !frame.draws.nodes) return null
  return (
    <>
      {rail.bars.map((bar) => {
        const label = frame.labels.get(bar.id)
        const shared = {
          bar,
          colour: rail.colour,
          labelId: frame.groups.get(bar.id) ?? null,
          top,
          treatment: frame.treatments.get(bar.id) ?? ('solid' as const),
        }
        const href = frame.hrefOf(bar.id)
        const mark = (
          <>
            {frame.draws.nodes ? <FeatureNode {...shared} /> : <FeatureBarMark {...shared} />}
            {label === undefined || frame.draws.nodes ? null : (
              <BarLabelText label={label} name={frame.names.get(bar.id) ?? ''} top={top} />
            )}
          </>
        )
        return (
          <g data-slot="feature-group" key={bar.id}>
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
