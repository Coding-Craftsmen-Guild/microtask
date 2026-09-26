import { COLUMN } from '@repo/ui/shell/page'
import type { Metadata } from 'next'
import { createPlan } from '../../actions/plans'
import { adminCall } from '../../actions/result'
import { CreatePlan } from '../../components/plans/create-plan'
import { PlanList } from '../../components/plans/plan-list'

/** The tab title this page gives the browser. */
export const metadata = { title: 'Macroplan · CC Guild' } satisfies Metadata

/**
 * `/`: the admin's landing page, which lists every plan this workspace holds.
 *
 * It reads `plans.list()` and nothing else. That list carries settings and three counts per plan
 * and never a plan's contents, so the one screen that renders none of 200 plans' 400,000 items does
 * not load them; and it carries a share-link **count** rather than seats, so no plan token reaches
 * this page's HTML however it is composed (ADR 0033).
 *
 * `workspace:list-plans` is admin-only (ADR 0009), which is why this is the admin surface's page
 * and there is no seat-facing version of it: a plan seat is refused the collection outright rather
 * than handed the one plan its token opens.
 *
 * A load failure is said in place of the list, in this surface's own words rather than the API's,
 * and an expired session redirects to `/login` from inside `adminCall` — for `/` there is no
 * `?next=` to carry, because `/` is where sign-in already lands.
 *
 * `Date.now()` is read once here and threaded down, so every row's age is measured against one
 * instant and the markup cannot disagree with itself. The create form is dated from the **same**
 * instant, in UTC — which is the zone `PlanService` defaults a new plan to, so the date the form
 * opens with and the calendar the plan is created on agree rather than nearly agreeing.
 *
 * The form sits **above** the list and outside the `loaded.ok` branch, so a workspace that holds no
 * plans yet and a read that failed both still offer the one control that makes a first plan. That is
 * the whole reason this page changed: the list's own empty state says there is nothing to open, and
 * for a while that was the literal truth of the product — every other write in the app is reachable
 * only from a plan page, and no plan could be made.
 *
 * It caps itself at legacy's 900px column, with `COLUMN` from `@repo/ui`. The admin layout takes
 * `Page`'s `wide` width for the plan page's timeline, and a layout cannot see which page it wraps — so
 * the one page that still wants the column says so. The cap is **imported rather than written out
 * again**, because a fourth spelling of `max-w-[900px]` would be free to drift from the three that
 * agree; and it is its own element rather than a class composed with this page's grid, because a class
 * name assembled at a call site is one Tailwind's scanner cannot read. A list of rows is unreadable
 * stretched across a wide monitor, which is the whole reason the cap exists.
 */
export default async function MacroplanPage() {
  const now = Date.now()
  const loaded = await adminCall('/', (api) => api.plans.list())
  return (
    <div className={COLUMN}>
      <div className="grid gap-4 pt-6">
        <CreatePlan onCreate={createPlan} today={new Date(now).toISOString().slice(0, 10)} />
        {loaded.ok ? (
          <PlanList now={now} plans={loaded.value.plans} />
        ) : (
          <p className="text-center text-muted-foreground" role="alert">
            {loaded.detail}
          </p>
        )}
      </div>
    </div>
  )
}
