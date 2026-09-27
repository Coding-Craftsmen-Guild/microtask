import type { Metadata } from 'next'
import { readShare } from './read-share'

const TITLE = 'Shared plan · CC Guild Macroplan'

const EMPTY =
  'Nothing is open beside the plan. A feature or an item has its own address here, so whatever is on screen can be linked to, reloaded and stepped back out of.'

/** The route's own parameters, which Next hands a page as a promise. */
export interface LinkPageProps {
  /** The share token, which is this page’s whole credential (ADR 0040). */
  readonly params: Promise<{ readonly token: string }>
}

/**
 * The tab title: the plan's own name, which the bootstrap already carries.
 *
 * One call and not two — `PlanShareView.plan` is `{ id, name }`, so the name is in the answer the screen
 * needs anyway, and no plan is read to title a tab. A refused bootstrap titles the tab without a name
 * rather than inventing one. `readShare` is `cache()`d on the token, so this shares the layout’s own call.
 *
 * It stays on the **page** rather than moving to the layout with the screen: a layout’s metadata is fixed
 * for every route beneath it, and a drawer segment should be able to title itself after what is open.
 */
export async function generateMetadata({ params }: LinkPageProps): Promise<Metadata> {
  const share = await readShare((await params).token)
  return { title: share.ok ? `${share.value.plan.name} · CC Guild Macroplan` : TITLE }
}

/**
 * `/s/<token>`: the drawer slot with nothing selected.
 *
 * ### The plan moved up, and this is what is left
 *
 * The plan itself — its name, its timeline, its table and its five managers — is now `layout.tsx`'s,
 * through `./seat-plan.tsx`. This is only what fills the slot beside them until a feature or an item is
 * open, and it is the exact shape `(admin)/plans/[planId]/page.tsx` already had.
 *
 * **Why the move was necessary rather than tidy.** A drawer is a route, so that opening a feature is one
 * soft navigation that re-renders the panel and leaves the canvas and the table alone — a layout does not
 * re-render when navigation moves between its children (ADR 0057). While this surface rendered the whole
 * screen from its `page.tsx`, there was nowhere for a drawer segment to sit that did not rebuild 2,200
 * table rows and 2,000 SVG nodes to open one panel. The admin surface was built that way from the start;
 * this one had no drawer at all until its writes were mounted, so it had never needed to be.
 *
 * It **takes no params and makes no call**: the empty state cannot differ from one plan to the next, and
 * the reads belong to the layout that draws the plan. `readShare` above is the one exception, and it is
 * `cache()`d on the token, so titling the tab costs no second request.
 */
export default function LinkPlanPage() {
  return (
    <p className="text-[13px] text-muted-foreground" data-slot="drawer-empty">
      {EMPTY}
    </p>
  )
}
