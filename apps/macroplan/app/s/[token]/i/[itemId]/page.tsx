/**
 * `/s/[token]/i/[itemId]`: an item's drawer on a seat, which the browser draws.
 *
 * The address still exists — it can be linked to, reloaded and stepped back through — but the plan's
 * layout hands the plan to the browser once, and the drawer is read off the address there and drawn from
 * that plan (`components/plan/app/plan-drawer.tsx`, ADR 0069). Opening it is a `history.pushState`, not a
 * request; so this page renders nothing and asks the API for nothing, on a reload as on a click.
 */
export default function SeatItemDrawerPage() {
  return null
}
