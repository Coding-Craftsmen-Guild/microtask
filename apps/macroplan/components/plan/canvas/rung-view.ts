import type { Rung } from '@repo/canvas'

/** Which marks one rung puts on a rail. */
export interface RungDrawing {
  /** Whether feature bars sized by estimate are drawn. */
  readonly bars: boolean

  /** Whether item marks are drawn under them. */
  readonly items: boolean

  /**
   * Whether each feature is drawn as a **node** instead of a bar.
   *
   * The epic rung's own mark. At a year on screen a four-day feature is sixteen px of bar, which is
   * narrower than the stroke around it, so §5 puts nodes there rather than bars that have shrunk into
   * ticks. A node is placed by the same span a bar would have been — it is the bar's start, not its
   * middle — so a rail reads left to right at the epic rung exactly as it does at the feature rung, and
   * an arc into a node lands where an arc into a bar would.
   *
   * Never true at the same time as {@link bars}. Nothing enforces that, because the two are one
   * decision made once in {@link DRAWS} and a canvas drawing both would be a table entry a reader can
   * see is wrong.
   */
  readonly nodes: boolean
}

/**
 * What each of §5's three rungs draws.
 *
 * §5's own three rows are epic rails with feature nodes, dependency arcs and milestone diamonds;
 * feature bars sized by estimate with items inside where they fit; and item bars with labels and the
 * linked Microtask task. All three rows now draw, which is what this revision changed: through phase 4
 * the epic rung drew its rails and their names and **nothing else**, because nodes, arcs and diamonds
 * were not built — a state the comments in this directory recorded rather than hid.
 *
 * Arcs are not in this table, and deliberately. They are drawn at **every** rung, into one layer over
 * the whole canvas rather than into a rail, because a dependency is the one thing that couples two
 * rails (§3.1) and the coupling does not stop being true at a narrower view. What changes with the rung
 * is what the arcs connect — nodes at the epic rung, bars below it — and both are placed by the same
 * span, so `arcLayout` needs no rung and is told none.
 *
 * Diamonds are not in this table either, for a different reason: a milestone is not a rung's decision
 * but a feature's. `isMilestone` reads the zero width `railLayout` already computed, so a milestone
 * draws as a diamond wherever a bar would have been drawn, at every rung that draws bars.
 *
 * A record rather than two `rung !== 'epic'` tests at the call sites, so the table above is one value a
 * reader can check against §5 and a widening cannot land in one branch and miss the other.
 */
export const DRAWS: Readonly<Record<Rung, RungDrawing>> = {
  epic: { bars: false, items: false, nodes: true },
  feature: { bars: true, items: true, nodes: false },
  item: { bars: true, items: true, nodes: false },
}
