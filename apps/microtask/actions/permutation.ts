/**
 * Whether `proposed` names every id in `current` exactly once, and nothing else.
 *
 * The API refuses anything else too, and it stays the gate. This runs first so a reorder built
 * from a stale page — one that has not seen a task somebody added since — is refused here with
 * a sentence the user can act on, rather than sent: a partial list is the input that, accepted
 * anywhere, silently drops whatever it left out.
 *
 * `proposed` is typed as a list but read as `unknown`, because it arrived as a Server Action
 * argument and a hostile browser can send anything in its place.
 */
export function isPermutationOf(current: readonly string[], proposed: readonly string[]): boolean {
  const sent: unknown = proposed
  if (!Array.isArray(sent)) return false
  const remaining = new Set(current)
  for (const id of sent) {
    if (typeof id !== 'string' || !remaining.delete(id)) return false
  }
  return remaining.size === 0
}

/** What a refused reorder says: the list the page was showing is not the list that exists. */
export const STALE_ORDER = 'This list changed since the page loaded. Reload the page and try again.'
