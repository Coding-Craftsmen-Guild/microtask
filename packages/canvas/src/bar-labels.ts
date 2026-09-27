import type { FeatureBar } from './rails.js'

/**
 * What a renderer knows about its own type, expressed as numbers this module can do arithmetic with.
 *
 * A component cannot measure text: `happy-dom` answers every `getBBox` and `getBoundingClientRect`
 * with a zero `DOMRect`, so a label placed by measurement is a label no test can check and a layout
 * that silently collapses under test. An average glyph advance is an approximation, but it is an
 * approximation that is the same in a browser and in a suite, which is the property that matters.
 */
export interface LabelMetrics {
  /** Average glyph advance at the label's font size, in px. */
  readonly charWidth: number

  /** Gap between a bar's edge and the text beside or inside it, in px. */
  readonly inset: number

  /** Shortest label worth putting inside a bar, in characters. Below this it goes outside. */
  readonly minInside: number

  /** How far past the last bar on a rail a label may run, in px. */
  readonly overhang: number
}

/**
 * Where one bar's name is drawn, and how much of it fits.
 *
 * `maxChars` is a budget, not a promise: the renderer truncates to it. Zero means there is no room
 * at all and nothing should be drawn — which is a real answer, not a failure, for a bar wedged
 * against its neighbour.
 */
export interface BarLabel {
  /** The feature the label names, matching {@link FeatureBar.id}. */
  readonly id: string

  /** Where the text starts. Always a left edge: every label is `text-anchor: start`. */
  readonly x: number

  /**
   * Whether the text sits on top of its bar rather than after it.
   *
   * The two want different colours — inside a filled bar the text must contrast with the fill,
   * outside it must contrast with the canvas — so this is answered here rather than re-derived by
   * comparing `x` against the bar a caller would have to look up again.
   */
  readonly inside: boolean

  /** How many characters fit. The renderer truncates to this; zero means draw nothing. */
  readonly maxChars: number
}

const charsIn = (room: number, metrics: LabelMetrics): number =>
  Math.max(0, Math.floor(room / metrics.charWidth))

const insideLabel = (bar: FeatureBar, metrics: LabelMetrics): BarLabel => ({
  id: bar.id,
  x: bar.x + metrics.inset,
  inside: true,
  maxChars: charsIn(bar.width - metrics.inset * 2, metrics),
})

const outsideLabel = (bar: FeatureBar, limit: number, metrics: LabelMetrics): BarLabel => {
  const start = bar.x + bar.width + metrics.inset
  return {
    id: bar.id,
    x: start,
    inside: false,
    maxChars: charsIn(limit - start - metrics.inset, metrics),
  }
}

const limitOf = (bars: readonly FeatureBar[], index: number, metrics: LabelMetrics): number => {
  const bar = bars[index]
  const end = bar === undefined ? 0 : bar.x + bar.width
  const next = bars[index + 1]
  return next === undefined ? end + metrics.overhang : next.x
}

/**
 * Where every bar on one rail puts its name.
 *
 * A bar wide enough for {@link LabelMetrics.minInside} characters carries its name on top of itself,
 * which is how a Gantt chart reads and what keeps a long rail from becoming a column of text running
 * off the right of the plan. A narrower bar — and every milestone, which has no width at all — puts
 * its name after itself, truncated to whatever gap precedes the next bar.
 *
 * ### Why one rail at a time
 *
 * The gap that bounds an outside label is the distance to the next bar **on the same rail**. Bars on
 * other rails are on other rows and cannot collide with this text. Taking a whole plan here would
 * mean grouping by rail first, which is `railLayout`'s job and already done by the time a caller has
 * a `RailBox` in hand.
 *
 * ### Order
 *
 * The argument's own order, which `railLayout` documents as non-decreasing in `x`. That promise is
 * what lets the neighbour be `bars[index + 1]` rather than a search.
 *
 * ### A bar with a neighbour is bounded by it, with no fallback
 *
 * The overhang applies to the **last** bar on a rail and to nothing else. Anything looser breaks the
 * ordinary case rather than an exotic one: features on a rail are scheduled back to back, so the next
 * bar usually starts exactly where this one ends. An earlier version treated a neighbour at or before
 * this bar's end as "no room to measure against" and fell back to the overhang, which meant every bar
 * in a contiguous run claimed 220px of it — four names drawn on top of each other at the same x, which
 * is what the rail had on screen.
 *
 * So a zero gap yields a zero budget and no label, and the reader gets the name from the row in the
 * sidebar, from the table, or by zooming in until the bar is wide enough to hold it. That is the
 * honest answer: at three pixels a day there is no room for a name, and drawing one anyway put a
 * feature's name over a different feature's bar.
 *
 * ### Purity
 *
 * Nothing is mutated and no argument is written to.
 */
export function barLabels(
  bars: readonly FeatureBar[],
  metrics: LabelMetrics,
): readonly BarLabel[] {
  return bars.map((bar, index) => {
    const room = charsIn(bar.width - metrics.inset * 2, metrics)
    if (room >= metrics.minInside) return insideLabel(bar, metrics)
    return outsideLabel(bar, limitOf(bars, index, metrics), metrics)
  })
}
