import type { Rung } from '@repo/canvas'

/** What one rung of the canvas draws for each feature on a rail. */
export interface RungDrawing {
  /** A bar spanning the days the feature takes. */
  readonly bars: boolean

  /** A tick per item under each bar, which only means anything beside a bar. */
  readonly items: boolean

  /** One point per feature, at the day it starts. */
  readonly nodes: boolean
}

/**
 * Which of the three each rung draws.
 *
 * ### Points above, bars at the bottom
 *
 * Year and Quarter draw **points**; only Sprint draws bars. A bar is a claim about duration, and a
 * claim about duration is only worth making at a scale where the duration is legible: at four pixels
 * a day a week-long feature and a fortnight-long one are a smear and a slightly wider smear, and the
 * eye reads the *position* either way. So the wider two rungs say the one thing they can say
 * honestly — when each piece of work starts, and what waits on what — and the graph they make of it
 * is the shape somebody actually reads a plan by.
 *
 * Quarter used to draw bars. At fourteen pixels a day most features came out under sixty pixels
 * wide, too narrow to hold their own name and too similar to each other to compare, so the rung cost
 * the clarity of a point and bought nothing with it.
 *
 * ### Why items follow bars
 *
 * An item tick sits under its feature's bar and divides it. With no bar there is nothing to divide,
 * and a row of ticks under a point is a claim about a span the rung is deliberately not making.
 */
export const DRAWS: Readonly<Record<Rung, RungDrawing>> = {
  epic: { bars: false, items: false, nodes: true },
  feature: { bars: false, items: false, nodes: true },
  item: { bars: true, items: true, nodes: false },
}
