/** The sentence a drawer says when the address names something the plan no longer holds. */
export const GONE = 'That is no longer on this plan. It may have been deleted, or the address may be wrong.'

/**
 * What the drawer slot shows for an address naming something the plan does not hold.
 *
 * It was the segment's `not-found.tsx`, rendered by a drawer page that called `notFound()`; the drawer is
 * drawn in the browser now (ADR 0069), so the same sentence is drawn here, in the same place, under the
 * same slot.
 */
export function DrawerGone() {
  return (
    <p className="text-[13px] text-muted-foreground" data-slot="drawer-not-found">
      {GONE}
    </p>
  )
}
