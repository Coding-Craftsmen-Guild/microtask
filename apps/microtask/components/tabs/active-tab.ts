/**
 * The tab a task page opens on: `?tab=` when it names one of **this task's** tabs, else the
 * first.
 *
 * Validated against the task's own list, so an id copied from another task — or guessed — can
 * never select anything outside it (ADR 0037). A repeated `?tab=` is treated as absent rather
 * than resolved, because choosing one copy is choosing which layer an attacker gets to confuse.
 * `null` only for a task with no tabs, which the domain refuses to store.
 */
export function activeTabId(
  tabs: readonly { readonly id: string }[],
  wanted: string | readonly string[] | undefined,
): string | null {
  const found = typeof wanted === 'string' ? tabs.find((tab) => tab.id === wanted) : undefined
  return found?.id ?? tabs[0]?.id ?? null
}
