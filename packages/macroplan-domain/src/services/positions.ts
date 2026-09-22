/** Anything a manifest keeps in an explicit order, numbered densely from zero. */
export interface Positioned {
  readonly id: string
  readonly position: number
}

const byPosition = (left: Positioned, right: Positioned): number => left.position - right.position

const numbered = <T extends Positioned>(group: readonly T[]): readonly T[] =>
  group.map((each, index) => (each.position === index ? each : { ...each, position: index }))

/**
 * Renumbers a group densely from zero in the order its own positions give, moving nothing.
 *
 * What a removal leaves behind: the gap closes, the survivors keep the relative order they had, and
 * an entry already carrying the right number comes back as the **same object**, so a renumbering
 * that changes nothing changes no bytes either. That is what lets the delete tests compare a whole
 * manifest against a plan built without the deleted branch.
 */
export function densified<T extends Positioned>(group: readonly T[]): readonly T[] {
  return numbered([...group].sort(byPosition))
}

/**
 * Reinserts one id at a position among its siblings and renumbers the group densely from zero.
 *
 * A single move rather than a permutation payload, which is the difference from Microtask's
 * reorder routes: there, a drag reorders a whole visible list; here, a drag moves one bar and
 * every other bar keeps the order it had. A 200-entry permutation on the wire for a one-bar move
 * would be a worse shape and a larger surface to get wrong.
 *
 * `position` is where the moved entry lands among the siblings that are left once it is lifted out,
 * and it is clamped to that range: past the end puts it last, below zero puts it first. Clamping
 * rather than refusing, because a drag to the end of a rail is the ordinary way to say "last" and a
 * client would otherwise have to know how many siblings there are to say it.
 *
 * Reads the incoming order from the positions rather than from array order, so a manifest whose
 * array order drifted from its positions still moves the bar the caller pointed at. An id no
 * sibling carries reinserts nothing and the group comes back densified — every caller in this
 * package resolves the entity first, so that is the shape of a group that was already correct.
 */
export function placeAmong<T extends Positioned>(
  siblings: readonly T[],
  id: string,
  position: number,
): readonly T[] {
  const ordered = [...siblings].sort(byPosition)
  const moving = ordered.find((each) => each.id === id)
  if (moving === undefined) return numbered(ordered)
  const rest = ordered.filter((each) => each.id !== id)
  const landing = Math.max(0, Math.min(Math.trunc(position), rest.length))
  return numbered([...rest.slice(0, landing), moving, ...rest.slice(landing)])
}
