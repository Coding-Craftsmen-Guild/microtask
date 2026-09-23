import type { FeatureBar, Treatment } from '@repo/canvas'
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
}

/**
 * One feature as a bar: a single `<rect>`, at the x and width `railLayout` already computed.
 *
 * **No arithmetic on days happens here.** `bar.x` and `bar.width` came from `dayToX` and
 * `widthOfDays` in `@repo/canvas`, which is the whole reason that package exists and was tested
 * without a DOM; a width recomputed here as `endDay - startDay + 1` is the classic off-by-one, and
 * `endDay` is exclusive precisely so nobody has to remember not to add the one.
 *
 * A **zero-width** bar is a real bar and is drawn as one: `startDay === endDay` is a placed
 * milestone that takes no time, which is a different statement from a feature the pass could not
 * place — that one has no span, so `railLayout` omits it from `bars` altogether and the sentence it
 * needs is a `'hollow'` treatment rather than a rect of zero width.
 *
 * The hue is an inline `style` and the treatment is a class, and {@link TREATMENT_CLASS} is where that
 * split is argued: a `#rrggbb` from the API is one of an unbounded set and no Tailwind class can be
 * chosen by a runtime value, while a treatment is a closed three-case union whose every class is
 * written out as a literal the scanner can read.
 */
export function FeatureBarMark({ bar, colour, treatment, top }: FeatureBarMarkProps) {
  return (
    <rect
      className={TREATMENT_CLASS[treatment]}
      data-feature-id={bar.id}
      data-slot="feature-bar"
      data-treatment={treatment}
      height={LAYOUT.barHeight}
      rx={BAR_RADIUS}
      style={hueStyle(treatment, colour)}
      width={bar.width}
      x={bar.x}
      y={insideRail(top, 'bar')}
    />
  )
}
