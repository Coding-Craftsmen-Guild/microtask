import { Invalid } from '@repo/kernel'

/** Anything a manifest keeps in an explicit order, numbered densely from zero. */
export interface Positioned {
  readonly id: string
  readonly position: number
}

const byPosition = (a: Positioned, b: Positioned): number => a.position - b.position

/** Copies the items into position order, leaving the items themselves untouched. */
export function inOrder<T extends Positioned>(items: readonly T[]): readonly T[] {
  return [...items].sort(byPosition)
}

/**
 * Renumbers items `0..n-1` in their current order, so neither a gap left by a removal nor a
 * clash between two equal positions can survive a write.
 */
export function densified<T extends Positioned>(items: readonly T[]): readonly T[] {
  return inOrder(items).map((item, index) =>
    item.position === index ? item : { ...item, position: index },
  )
}

/**
 * Renumbers items into the order `ids` names.
 *
 * The order must name every item exactly once: a caller reordering from a stale list would
 * otherwise silently drop whatever it had not seen, so a partial order is refused as `Invalid`
 * before anything is written. `label` names the thing being ordered in that message.
 */
export function reordered<T extends Positioned>(
  items: readonly T[],
  ids: readonly string[],
  label: string,
): readonly T[] {
  const known = new Map(items.map((item) => [item.id, item]))
  const refuse = (): never => {
    throw new Invalid(`The order must name every ${label} exactly once`)
  }
  if (ids.length !== known.size || new Set(ids).size !== ids.length) refuse()
  return ids.map((id, index) => {
    const item = known.get(id)
    return item === undefined ? refuse() : { ...item, position: index }
  })
}
