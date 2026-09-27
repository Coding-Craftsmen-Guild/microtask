import type { FeatureBar, Treatment } from '@repo/canvas'
import { diamondPoints, isMilestone } from '@repo/canvas'
import { hueStyle, TREATMENT_CLASS } from './treatments'
import { insideRail, LAYOUT } from './view'

const BAR_RADIUS = 3

/** Props for {@link FeatureBarMark}. */
export interface FeatureBarMarkProps {
  /** The bar, already laid out: its days and its px, computed by `railLayout`. */
  readonly bar: FeatureBar

  /** Its rail's epic's own `#rrggbb`, or `null` for a rail no epic claims. */
  readonly colour: string | null

  /** How its schedule says to draw it. */
  readonly treatment: Treatment

  /** The y of its rail's own band. */
  readonly top: number

  /**
   * The group this feature is in, or `null` for one in none.
   *
   * It paints nothing. It lands as `data-label-id`, and the one CSS rule `labels/group-css.ts` generates per group
   * is what reads it back — so choosing a group dims every bar not in it, across every rail, with no
   * JavaScript. `null` writes **no attribute at all** rather than an empty one, so `[data-label-id]`
   * selects exactly the bars that are in some group and an ungrouped bar is dimmed by the `:not()` alone.
   */
  readonly labelId: string | null
}

/**
 * One feature as a bar — or, when it takes no time, as a milestone diamond.
 *
 * **No arithmetic on days happens here.** `bar.x` and `bar.width` came from `dayToX` and
 * `widthOfDays` in `@repo/canvas`, which is the whole reason that package exists and was tested
 * without a DOM; a width recomputed here as `endDay - startDay + 1` is the classic off-by-one, and
 * `endDay` is exclusive precisely so nobody has to remember not to add the one.
 *
 * ### A milestone is a diamond, and which shape is drawn is not this file's decision
 *
 * `isMilestone` reads the **zero width the layout already computed**, so the question is answered where
 * the answer exists and not from `estimateDays` — an effective estimate may have been derived from a
 * feature's items rather than authored on it (ADR 0051), and a component testing the authored field
 * would miss a feature whose children all came to zero and would need a plan in hand to do it.
 *
 * `startDay === endDay` is a placed milestone that takes no time, which is a different statement from a
 * feature the pass could not place — that one has no span at all, so `railLayout` omits it from `bars`
 * and the sentence it needs is `UnplacedFeatures`' stub rather than a mark of no size. Through phase 4
 * a milestone drew as a `<rect>` of zero width, which is to say it drew as nothing; §5 asks for a
 * diamond and `diamondPoints` is where its four corners are computed.
 *
 * It is centred on `bar.x` — the day itself — and vertically on the middle of the band a bar would have
 * filled, which is exactly the y `arcLayout` sends an arc to. So an arc into a milestone lands on the
 * diamond's point rather than near it, with neither file told about the other.
 *
 * **A bar names no date on hover, and that is a scope decision rather than an oversight.** §5 puts
 * the dates on the quarter bands' sprint ticks, which `SprintTickLayer` draws, and a bar would need
 * two things it has not got: a `FeatureBar` carries `startDay` and `endDay` and no calendar date at
 * all, so `@repo/canvas` would have to grow them — and the app must not convert an offset back to a
 * date itself, because a weekend-adjacent one does not survive the round trip. The second thing is
 * cheaper to say: a `<title>` per bar and per mark is one extra node per bar and per mark, which at
 * this product's 2 000-item cap is the doubling `ItemMarkShape` exists to refuse.
 *
 * The hue is an inline `style` and the treatment is a class, and {@link TREATMENT_CLASS} is where that
 * split is argued: a `#rrggbb` from the API is one of an unbounded set and no Tailwind class can be
 * chosen by a runtime value, while a treatment is a closed five-case union whose every class is
 * written out as a literal the scanner can read.
 *
 * ### The geometry is carried as data attributes, and that is what a drop is resolved against
 *
 * `data-x`, `data-y`, `data-width`, `data-start-day` and `data-end-day` are written out beside the
 * geometry they became. Nothing on this canvas reads them; `./selection.ts` does, and it is what a drag
 * needs: a client component may be handed primitives, an unbound function or `null` and nothing else
 * (`../module-boundaries.test.tsx`), so the layout cannot cross into a drag as a prop, and the drag
 * rebuilds the `RailBox[]` it hands `dropTargetFor` out of the markup the server drew.
 *
 * The three px numbers are **duplicated** out of the presentation attributes deliberately, and that is
 * what makes a milestone draggable: a `<polygon>` has no `x`, no `y` and no `width`, so a reader going
 * to the presentation attributes would get `NaN` for every milestone on the canvas and silently place a
 * drag at the gutter. Reading `data-` instead makes the drag independent of which shape was drawn,
 * which is the property that matters — the reader must not have to know.
 *
 * They are carried rather than inverted on the way back for the same reason the two days are. `xToDay`
 * is the documented inverse of `dayToX` and would answer `startDay` exactly, but a width has no
 * exported inverse at all, so the app would be dividing by `pxPerDay` itself — the one thing ADR 0055
 * puts in `@repo/canvas` rather than in a component.
 */
export function FeatureBarMark({ bar, colour, treatment, top, labelId }: FeatureBarMarkProps) {
  const y = insideRail(top, 'bar')
  if (isMilestone(bar)) {
    return (
      <polygon
        className={TREATMENT_CLASS[treatment]}
        data-end-day={bar.endDay}
        data-feature-id={bar.id}
        data-label-id={labelId ?? undefined}
        data-milestone="true"
        data-slot="feature-bar"
        data-start-day={bar.startDay}
        data-treatment={treatment}
        data-width={bar.width}
        data-x={bar.x}
        data-y={y}
        points={diamondPoints(bar.x, y + LAYOUT.barHeight / 2)}
        style={hueStyle(treatment, colour)}
      />
    )
  }
  return (
    <rect
      className={TREATMENT_CLASS[treatment]}
      data-end-day={bar.endDay}
      data-feature-id={bar.id}
      data-label-id={labelId ?? undefined}
      data-slot="feature-bar"
      data-start-day={bar.startDay}
      data-treatment={treatment}
      data-width={bar.width}
      data-x={bar.x}
      data-y={y}
      height={LAYOUT.barHeight}
      rx={BAR_RADIUS}
      style={hueStyle(treatment, colour)}
      width={bar.width}
      x={bar.x}
      y={y}
    />
  )
}
