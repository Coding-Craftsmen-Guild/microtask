/**
 * `ids` with `id` moved one step by `delta`, or `null` where there is nowhere to go.
 *
 * The answer is always a full permutation of `ids`: a relative move is computed into the whole
 * order here, because every reorder route — folders, tasks and tabs alike — takes the whole order
 * and refuses anything less. The app being replaced had a `move {direction}` route for tabs; this
 * API has none. Every other id keeps its place, which is the one-step swap legacy's Move left and
 * Move right performed, and `null` at either end is the fact legacy drew as a disabled item. An id
 * the list does not hold is `null` too rather than a guess: the list is the page's, and an order
 * built from one that no longer matches is what the API refuses.
 */
export function moved(ids: readonly string[], id: string, delta: -1 | 1): string[] | null {
  const from = ids.indexOf(id)
  const to = from + delta
  if (from < 0 || to < 0 || to >= ids.length) return null
  const order = [...ids]
  order[from] = ids[to] ?? id
  order[to] = id
  return order
}
