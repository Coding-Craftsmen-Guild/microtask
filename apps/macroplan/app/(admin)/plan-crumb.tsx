import { CrumbTrail } from '@repo/ui/shell/crumb-trail'
import { PLANS_INDEX_PATH } from '../../lib/routes'
import { readPlan } from './plans/[planId]/read-plan'

const PLANS = 'Plans'

/** Props for {@link PlanCrumb}, which Next supplies from the slot's own `[planId]`. */
export interface PlanCrumbProps {
  readonly params: Promise<{ readonly planId: string }>
}

/**
 * The brand bar's trail while a plan is open: **Plans / &lt;the plan's name&gt;**.
 *
 * ### Why it is a parallel route and not a prop
 *
 * The bar is rendered by `(admin)/layout.tsx`, which heads every admin page, and the plan's name is
 * known two segments below it. A layout cannot be handed a prop by its children and cannot read a
 * deeper segment's `params`, so there is no way down — but there is a way **up**, and it is the one
 * the App Router provides: a named slot (`@crumbs`) is a second route tree matched against the same
 * URL, rendered into the layout beside `children`. This file is that tree's answer for a plan.
 *
 * It costs no second request. `readPlan` is `cache()`d per request and keyed on the id, so this and
 * the plan layout beside it make one call between them — which is the same property that already
 * lets `generateMetadata` title the tab from the plan's own name.
 *
 * ### Why the name is not a link
 *
 * It is the page being read. `CrumbTrail` renders a `null` href as plain text for that reason, and
 * `Plans` above it is the only step that goes anywhere.
 *
 * ### What a refused read draws
 *
 * The trail with its last step missing, so the bar still says `Plans` and still gets back to the
 * index. The page below is already saying what went wrong, in a sentence sized for it; a bar that
 * repeated the refusal in 13px would be the same bad news twice, and a bar that vanished would take
 * the way out with it.
 */
export default async function PlanCrumb({ params }: PlanCrumbProps) {
  const loaded = await readPlan((await params).planId)
  const here = loaded.ok ? [{ label: loaded.value.name, href: null }] : []
  return <CrumbTrail trail={[{ label: PLANS, href: PLANS_INDEX_PATH }, ...here]} />
}
