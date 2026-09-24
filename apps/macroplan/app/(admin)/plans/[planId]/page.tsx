const EMPTY =
  'Nothing is open beside the plan. A feature or an item has its own address here, so whatever is on screen can be linked to, reloaded and stepped back out of.'

/**
 * `/plans/[planId]`: the drawer slot with nothing selected.
 *
 * ### It is a page, not a hidden panel
 *
 * The plan itself — its name, its timeline and its table — is `layout.tsx`'s, and this is only what
 * fills the slot beside them until a feature or an item is open. So there is no collapsed drawer
 * here and no `hidden` panel waiting to be filled: `plan-screen.tsx` keeps the table always mounted
 * for a reason that does not apply to an empty panel — "the table is the only rendering a reader can
 * read", so hiding it would cost a reader the plan, where a second always-mounted panel with nothing
 * in it costs a reader a container and says nothing. A sentence in its place is markup somebody
 * reads.
 *
 * It **takes no params and makes no call**. The empty state cannot differ from one plan to the next,
 * the plan read belongs to the layout that draws the plan, and a second read here would be the one
 * thing `read-plan.ts` is `cache()`d to prevent — so this is the one page under the segment that asks
 * the API nothing. There is nothing here to refuse, and nothing to hand a component.
 *
 * The sentence says what the address does rather than telling the reader to click something: nothing
 * on the canvas or in the table links into a drawer yet, and a sentence promising a click that does
 * not exist would be worse than no sentence. The task that draws those links is the one that makes it
 * an instruction.
 */
export default function PlanPage() {
  return (
    <p className="text-[13px] text-muted-foreground" data-slot="drawer-empty">
      {EMPTY}
    </p>
  )
}
