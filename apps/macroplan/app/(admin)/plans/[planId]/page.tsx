/**
 * `/plans/[planId]`: the drawer slot with nothing open, which draws nothing.
 *
 * ### It used to say so in a sentence, and that was the right answer for a different drawer
 *
 * Through phase 4 this page rendered one paragraph — that nothing was open beside the plan, and that a
 * feature or an item has its own address here — because the drawer was then a card in the page's own flow,
 * and an empty slot would have been a gap with no explanation. A drawer is now a panel docked to the
 * right-hand edge (`components/plan/drawer/drawer-shell.tsx`), so there is no gap to explain: nothing open
 * means no panel, and the graph has the full width.
 *
 * The sentence also described what the address does rather than how to open anything, which was honest when
 * nothing on the page linked into a drawer. It is out of date now: the sidebar links to every rail and every
 * feature, so the way in is on screen and does not need narrating.
 *
 * ### It takes no params and makes no call
 *
 * As it never did. The empty state cannot differ from one plan to the next, the plan read belongs to the
 * layout that draws the plan, and a second read here would be the one thing `read-plan.ts` is `cache()`d to
 * prevent. So this stays the one page under the segment that asks the API nothing, and now the one that
 * renders nothing either.
 */
export default function PlanPage() {
  return null
}
