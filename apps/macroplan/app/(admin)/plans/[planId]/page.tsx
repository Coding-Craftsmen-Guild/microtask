import type { Metadata } from 'next'
import { PlanScreen } from '../../../../components/plan/plan-screen'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { readPlan } from './read-plan'

/** The route's own parameters, which Next hands a page as a promise. */
export interface PlanPageProps {
  /** `planId` from `/plans/[planId]`, untrusted until the API has read it. */
  readonly params: Promise<{ readonly planId: string }>
}

/** The tab title: the plan's name, then the product. */
export async function generateMetadata({ params }: PlanPageProps): Promise<Metadata> {
  const loaded = await readPlan((await params).planId)
  return { title: loaded.ok ? `${loaded.value.name} · CC Guild Macroplan` : 'Plan · CC Guild Macroplan' }
}

/**
 * `/plans/[planId]`: one plan's timeline, which is what the plan list's rows have been pointing at.
 *
 * It reads `plans.read()` **once**, shared with `generateMetadata` through `React.cache`, and that one
 * response carries the whole plan and the schedule derived from it — the API computes a schedule on
 * read and never stores one (ADR 0048, spec §3.4), so there is no second call to make and nothing for
 * this page to recompute. Nothing here re-derives a span, a rail order or an x.
 *
 * The clock is read once, here — `new Date()`, which is what `PlanScreen.at` takes — and threaded
 * down as the instant the today line is drawn at, as the `/s/<token>` page does. The
 * canvas takes it as a prop rather than reading the clock itself, which is what `todayLine` in
 * `@repo/canvas` asks of a caller — "A caller reads the clock; this reads the caller" — and is why a
 * test can pin a date and get one answer.
 *
 * What it hands down is **not** what the API answered. `plans.read()` serves an admin every seat on
 * the plan and its live token, and `read-plan.ts` reduces that to a `PlanScreenModel` whose type
 * cannot hold one — so there is no share token in this page's props for the Flight payload to carry,
 * and none for a client component added inside `PlanScreen` to drag into the HTML (ADR 0033). That is
 * the same type `PlanScreen` takes and the same one `/s/<token>` reduces to, so the guarantee is one
 * compiler check on both surfaces rather than a mechanism per page.
 *
 * What it hands down about authority is {@link ADMIN_CONTROLS} and not a principal: the admin is not
 * a role in the capability model, so there is no role for this page to pass and nothing for the
 * screen to derive one from (`lib/admin-controls.ts`). The seat page asks `planCapabilities` for its
 * own answers and hands down the same shape, which is what lets one screen serve both audiences.
 *
 * A plan the API does not hold, and an id that is not a ULID, are both `not-found.tsx`; `read-plan.ts`
 * is where that is argued. Every other refusal is said in place of the timeline, in this surface's own
 * words rather than the API's, and an expired session redirects to `/login?next=/plans/<id>` from
 * inside `adminCall` so the admin lands back on the plan they were reading.
 */
export default async function PlanPage({ params }: PlanPageProps) {
  const loaded = await readPlan((await params).planId)
  if (!loaded.ok) {
    return (
      <p className="py-16 text-center text-muted-foreground" role="alert">
        {loaded.detail}
      </p>
    )
  }
  return <PlanScreen at={new Date()} controls={ADMIN_CONTROLS} plan={loaded.value} />
}
