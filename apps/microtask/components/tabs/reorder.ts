/** Which neighbour a tab trades places with. */
export type MoveDirection = 'left' | 'right'

/**
 * The whole order after moving one tab a step, or `null` when there is nowhere to move it.
 *
 * The app being replaced had a `move {direction}` route that swapped two tabs; this API has
 * none, only `tabs.reorder` taking a strict permutation, so the swap is computed here and the
 * full list is what is sent. Every other tab keeps its place, which is the one-step swap legacy's
 * Move left and Move right performed.
 *
 * `null` at the ends is the same fact legacy drew as a disabled menu item, and a tab the list does
 * not hold is `null` too rather than a guess — the list is the page's, and a reorder built from
 * one that no longer matches the task is what the API refuses as not a permutation.
 */
export function movedOrder(
  ids: readonly string[],
  id: string,
  direction: MoveDirection,
): readonly string[] | null {
  const from = ids.indexOf(id)
  const to = direction === 'left' ? from - 1 : from + 1
  const neighbour = ids[to]
  if (from === -1 || neighbour === undefined) return null
  const order = [...ids]
  order[to] = id
  order[from] = neighbour
  return order
}
