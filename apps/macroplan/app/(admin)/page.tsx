import type { Metadata } from 'next'
import { adminCall } from '../../actions/result'
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
 * instant and the markup cannot disagree with itself.
 *
 * It caps itself at legacy's 900px column. The admin layout takes `Page`'s `wide` width for the plan
 * page's timeline, and a layout cannot see which page it wraps — so the one page that wants the column
 * says so, and pays for it by repeating a class string `Page` would otherwise own. A list of rows is
 * unreadable stretched across a wide monitor, which is the whole reason that cap exists.
 */
export default async function MacroplanPage() {
  const loaded = await adminCall('/', (api) => api.plans.list())
  return (
    <div className="mx-auto grid w-full max-w-[900px] gap-4 pt-6">
      {loaded.ok ? (
        <PlanList now={Date.now()} plans={loaded.value.plans} />
      ) : (
        <p className="text-center text-muted-foreground" role="alert">
          {loaded.detail}
        </p>
      )}
    </div>
  )
}
