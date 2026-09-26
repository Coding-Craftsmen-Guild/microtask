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
 * **A bar names no date on hover, and that is a scope decision rather than an oversight.** §5 puts
 * the dates on the quarter bands' sprint ticks, which `SprintTickLayer` draws, and a bar would need
 * two things it has not got: a `FeatureBar` carries `startDay` and `endDay` and no calendar date at
 * all, so `@repo/canvas` would have to grow them — and the app must not convert an offset back to a
 * date itself, because a weekend-adjacent one does not survive the round trip. The second thing is
 * cheaper to say: a `<title>` per bar and per mark is one extra node per bar and per mark, which at
 * this product's 2 000-item cap is the doubling `ItemMarkShape` exists to refuse.
 *
 * **So hovering a placed bar reveals nothing, and no other layer covers for it.** The sprint's
 * hover target sits *behind* this rect, and an SVG tooltip resolves by walking the DOM ancestors of
 * the element the pointer hit rather than by paint order — a painted fill absorbs the pointer and
 * the rect beneath is never consulted. Measured in Chromium: the sprint sentence appears over a
 * `'hollow'` bar's interior, whose `fill-none` lets the pointer through, and not over a `'solid'`
 * one. Evening that out means moving the target above the rails, which phase 3 must not inherit —
 * it is the editing phase, and a transparent sheet over every bar would swallow the drag and the
 * click it adds. A bar's own hover is phase 3's work, with the layer order it revisits anyway.
 *
 * The hue is an inline `style` and the treatment is a class, and {@link TREATMENT_CLASS} is where that
 * split is argued: a `#rrggbb` from the API is one of an unbounded set and no Tailwind class can be
 * chosen by a runtime value, while a treatment is a closed three-case union whose every class is
 * written out as a literal the scanner can read.
 *
 * ### The two days are carried as attributes, and that is what a drop is resolved against
 *
 * `data-start-day` and `data-end-day` are this bar's own `startDay` and `endDay`, written out beside
 * the geometry they were turned into. Nothing on this canvas reads them; `./selection.ts` does, and it
 * is what a drag needs: a client component may be handed primitives, an unbound function or `null` and
 * nothing else (`../module-boundaries.test.tsx`), so the layout cannot cross into a drag as a prop, and
 * the drag rebuilds the `RailBox[]` it hands `dropTargetFor` out of the markup the server drew. Those
 * two numbers are the only members of a `FeatureBar` the geometry does not leave in the SVG.
 *
 * They are **carried** rather than derived from `x` and `width` on the way back, which would be the
 * obvious saving. `xToDay` is the documented inverse of `dayToX` and would answer `startDay` exactly,
 * but a width has no exported inverse at all, so the app would be dividing by `pxPerDay` itself — the
 * one thing ADR 0055 puts in `@repo/canvas` rather than in a component. Two attributes on at most
 * `LIMITS.featuresPerPlan` rects is the cheaper half of that trade, and `item-mark.tsx`'s budget is
 * about **elements** rather than attributes, so nothing there is touched.
 */
export function FeatureBarMark({ bar, colour, treatment, top, labelId }: FeatureBarMarkProps) {
  return (
    <rect
      className={TREATMENT_CLASS[treatment]}
      data-end-day={bar.endDay}
      data-feature-id={bar.id}
      data-label-id={labelId ?? undefined}
      data-slot="feature-bar"
      data-start-day={bar.startDay}
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
