import type { RailBox } from '@repo/canvas'
import { ItemMarkShape } from './item-mark'
import { hueOf, type RailFrame } from './view'

/** Props for {@link RailItems}. */
export interface RailItemsProps {
  /** The rail being drawn. */
  readonly rail: RailBox

  /** Everything the marks are drawn from. */
  readonly frame: RailFrame

  /** The top of the rail. */
  readonly top: number
}

/**
 * The items of every feature on one rail, in the order the schedule placed them.
 *
 * ### Why an item is not an anchor where a feature is
 *
 * The element budget. This canvas draws two thousand items at the cap under a budget of one element
 * each, and an `<a>` per item is two thousand more (`./plan-canvas.test.tsx` holds the count). Clicking
 * one still opens it: `./plan-pointer.tsx` reads the id off the mark and builds the route from the
 * address bar, which is the one place a seat's token is already allowed to be — the design asks for both
 * ("click a feature band or an item to open it as a tab"), and this is how an item gets it for nothing.
 */
export function RailItems({ rail, frame, top }: RailItemsProps) {
  if (!frame.draws.items) return null
  return (
    <>
      {rail.bars.flatMap((bar) =>
        (frame.marks.get(bar.id) ?? []).map((mark, index) => (
          <ItemMarkShape
            colour={hueOf(frame, bar.id, rail.colour)}
            detail={frame.details.get(mark.id) ?? null}
            hoverId={bar.id}
            key={mark.id}
            labelId={frame.groups.get(bar.id) ?? null}
            mark={mark}
            name={frame.names.get(mark.id) ?? ''}
            position={index}
            top={top}
            treatment={frame.treatments.get(mark.id) ?? 'solid'}
          />
        )),
      )}
    </>
  )
}
