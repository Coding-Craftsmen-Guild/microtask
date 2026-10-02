import { openedHref, planRootOf, splitTabs, stackedHref } from '../drawer/tab-stack'

const LINK = '[data-slot="feature-link"]'

const ITEM = '[data-item-id]'

/**
 * Where a click on a mark goes: that subject's own route, with the tabs already open added to it.
 *
 * ### Two kinds of mark, two ways to the same answer
 *
 * A feature is an anchor and carries its route, so the stack is simply written into it. An item is not,
 * because an `<a>` per item is two thousand elements at this product's cap (`./rail-items.tsx`), so its
 * route is built here from its id and the address the browser is already on.
 *
 * Reading the plan's path out of `location` is what lets that work on a seat without a token ever being
 * handed to a component: the token is in the address bar because the reader followed a link there, which
 * is not the boundary ADR 0033 is about (`../drawer/tab-stack.ts`).
 *
 * @param target - Whatever the click named as its target.
 * @param open - The `open` parameter as it is now.
 * @param pathname - Where the browser is.
 * @returns The address to push, or `null` for a click on nothing openable.
 */
export function openClick(
  target: Element | null,
  open: string | null,
  pathname: string,
): string | null {
  const linked = target?.closest(LINK)?.getAttribute('href') ?? null
  if (linked !== null) return stackedHref(linked, open)
  const id = target?.closest(ITEM)?.getAttribute('data-item-id') ?? ''
  if (id === '') return null
  return openedHref(planRootOf(pathname), { id, kind: 'item' }, splitTabs(open ?? undefined))
}
