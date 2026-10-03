/** Anything kept in a dense 0-based order within one parent: a feature on a rail, an item in a feature. */
export interface Ordered {
  readonly id: string
  readonly position: number
}

const byPosition = (left: Ordered, right: Ordered): number => left.position - right.position

const numbered = <T extends Ordered>(group: readonly T[]): readonly T[] =>
  group.map((each, index) => (each.position === index ? each : { ...each, position: index }))

/**
 * One group renumbered 0..n-1 in the order its positions already gave it.
 *
 * The browser's copy of `densified` in `@repo/macroplan-domain`'s `services/positions.ts`, which the app
 * may not import (its barrel reaches `node:path`, ADR 0027). It has to be the same rule rather than a
 * similar one: an optimistic edit is replaced by the API's answer a round trip later, and any difference
 * between the two renumberings is a bar that jumps when the answer lands (ADR 0069). An object whose
 * position is already right is handed back as it is, as the domain's is.
 *
 * @param group - Siblings under one parent, in any array order.
 * @returns The same siblings, sorted by position and numbered densely.
 */
export function densified<T extends Ordered>(group: readonly T[]): readonly T[] {
  return numbered([...group].sort(byPosition))
}

/**
 * Siblings with one of them moved to a place, everything renumbered densely.
 *
 * The domain's `placeAmong`, rule for rule: the place is truncated and clamped to the list without the
 * moving sibling, so a place past the end means the end and a negative one means the start, and an id
 * not among the siblings leaves them merely renumbered.
 *
 * @param siblings - Everything under the destination parent, the moving one included.
 * @param id - The sibling being moved.
 * @param position - Where it should land.
 * @returns The siblings in their new order, numbered from zero.
 */
export function placeAmong<T extends Ordered>(siblings: readonly T[], id: string, position: number): readonly T[] {
  const ordered = [...siblings].sort(byPosition)
  const moving = ordered.find((each) => each.id === id)
  if (moving === undefined) return numbered(ordered)
  const rest = ordered.filter((each) => each.id !== id)
  const landing = Math.max(0, Math.min(Math.trunc(position), rest.length))
  return numbered([...rest.slice(0, landing), moving, ...rest.slice(landing)])
}

/**
 * Every group in a flat list renumbered, without moving anything in the array.
 *
 * The domain's `densifiedFeatures` and `densifiedItems`, which differ only in which field names the
 * parent, so here the parent is a function. The array order is kept because it is meaningful to a
 * caller: the API appends a created entity, and the draw gesture reads the last one as the new one.
 *
 * @param all - Every entity, across every parent.
 * @param parentOf - The parent an entity belongs to.
 * @returns The same entities in the same array order, positions dense within each parent.
 */
export function densifiedBy<T extends Ordered>(all: readonly T[], parentOf: (one: T) => string): readonly T[] {
  const renumbered = new Map<string, T>()
  for (const parent of new Set(all.map(parentOf))) {
    for (const each of densified(all.filter((one) => parentOf(one) === parent))) renumbered.set(each.id, each)
  }
  return all.map((each) => renumbered.get(each.id) ?? each)
}
