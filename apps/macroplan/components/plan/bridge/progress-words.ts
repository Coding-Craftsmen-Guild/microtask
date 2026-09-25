/** A counted checklist state, as the bridge reports one. */
export interface Counted {
  readonly done: number
  readonly total: number
}

/**
 * A counted state as a percentage, rounded, or `null` when nothing is counted.
 *
 * `null` rather than `0` for `total === 0`, and the difference is the product's central claim: design
 * §7.2 fixes that "an unlinked item has a manual status only — not a manual percentage — so a number on
 * screen is always a counted number". A linked task with no checklist in it counts nothing, and `0%`
 * would be a number nobody counted — indistinguishable on screen from a task where everything is still
 * to do. So the caller has to decide what to draw for "nothing to count", and cannot do it by accident.
 *
 * Rounded rather than floored, so 1 of 3 reads as 33% and 2 of 3 as 67%. The cost is that 99.5% of a
 * long checklist rounds to 100 while one item remains — which is why {@link progressWords} says the
 * count as well, and why a bar's fill is computed from the fraction rather than from this.
 */
export function progressPercent(counted: Counted): number | null {
  if (counted.total <= 0) return null
  return Math.round((counted.done / counted.total) * 100)
}

/**
 * The fraction of a bar to fill, between 0 and 1, and `0` when nothing is counted.
 *
 * Separate from {@link progressPercent} because a fill must not round: two bars differing by one item
 * out of two hundred should differ by a pixel rather than by nothing, and a rounded percentage turned
 * back into a width throws that away. Clamped, so a manifest whose cached count has drifted above its
 * total cannot draw a bar wider than its own mark.
 */
export function progressFraction(counted: Counted): number {
  if (counted.total <= 0) return 0
  return Math.min(1, Math.max(0, counted.done / counted.total))
}

/**
 * What a counted state reads as: the percentage, the count, and what "nothing counted" says.
 *
 * One function so the table, the bindings panel and the canvas's accessible label cannot word the same
 * fact three ways. It says both the percentage and the count on purpose: a percentage alone hides how
 * much work it is a percentage *of*, and 100% of two is a different sentence from 100% of two hundred.
 */
export function progressWords(counted: Counted): string {
  const percent = progressPercent(counted)
  if (percent === null) return 'nothing counted yet'
  return `${String(percent)}% — ${String(counted.done)} of ${String(counted.total)} done`
}
