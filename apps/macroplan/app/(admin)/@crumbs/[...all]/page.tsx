import { CrumbTrail } from '@repo/ui/shell/crumb-trail'
import { PLANS_INDEX_PATH } from '../../../../lib/routes'
import { readPlan } from '../../plans/[planId]/read-plan'

const PLANS = 'Plans'

const PLANS_SEGMENT = 'plans'

/** Props for {@link AdminCrumbs}, which Next fills from the catch-all this file sits under. */
export interface AdminCrumbsProps {
  /** Every path segment under this route group. At least one, this catch-all not being optional. */
  readonly params: Promise<{ readonly all: readonly string[] }>
}

/**
 * The brand bar's trail, for whatever admin URL is open.
 *
 * ### Why it is a parallel route
 *
 * The bar is rendered by `(admin)/layout.tsx`, which heads every admin page, and the plan's name is
 * known two segments below it. A layout cannot be handed a prop by its children and cannot read a
 * deeper segment's `params`, so there is no way down — but there is a way **up**, and it is the one
 * the App Router provides: a named slot is a second route tree matched against the same URL and
 * rendered into the layout beside `children`.
 *
 * ### Why it is one catch-all and not a tree mirroring the pages
 *
 * **This is the defect this shape exists to prevent, and it shipped once.** The slot was
 * `@crumbs/plans/[planId]/page.tsx` with a `default.tsx` beside it, on the assumption that a URL the
 * slot's own tree does not reach falls back to the nearest default. It does not: Next looks for a
 * `default.tsx` at the level the **URL** names, not at the level the slot's tree ends. So every
 * deeper route — `/f/<id>`, `/i/<id>`, `/r/<id>`, `/g/<id>`, `/new/rail`, `/new/group` — had an
 * unmatched slot and answered **404**. Every drawer on the admin surface was unreachable, and no test
 * in this repo could have seen it: each page renders correctly in isolation, and the fault is in how
 * the router assembles them. It was found by opening a feature in a browser.
 *
 * A `default.tsx` per leaf would fix the six routes that exist and break the seventh the day it is
 * added. A catch-all cannot: it matches every URL under this group that has a segment at all, so the
 * slot always has an answer and adding a route is not a thing that can forget this file.
 *
 * It is **required** and not optional — `[...all]` and not `[[...all]]` — because an optional one has
 * the same specificity as the index, and the two are a build error: "You cannot define a route with
 * the same specificity as an optional catch-all route". The index is the one URL under this group
 * with no segments, so it is the one the `default.tsx` beside this directory answers.
 *
 * ### What it costs, which is nothing
 *
 * `readPlan` is `cache()`d per request and keyed on the id, so this and the plan layout beside it
 * make one call between them — the same property that already lets `generateMetadata` title the tab
 * from the plan's own name. Off the plan tree it reads nothing at all.
 *
 * ### What a refused read draws
 *
 * The trail with its last step missing, so the bar still says `Plans` and still gets back to the
 * index. The page below is already saying what went wrong, in a sentence sized for it; a bar that
 * repeated the refusal in 13px would be the same bad news twice, and a bar that vanished would take
 * the way out with it.
 */
export default async function AdminCrumbs({ params }: AdminCrumbsProps) {
  const all = (await params).all
  const [root, planId] = all
  if (root !== PLANS_SEGMENT || planId === undefined) return null
  const loaded = await readPlan(planId)
  const here = loaded.ok ? [{ label: loaded.value.name, href: null }] : []
  return <CrumbTrail trail={[{ label: PLANS, href: PLANS_INDEX_PATH }, ...here]} />
}
