import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PlanScreen } from '../../../components/plan/plan-screen'
import { readSeatPlan, readShare } from './read-share'

const TITLE = 'Shared plan · CC Guild Macroplan'

/** The route's own parameters, which Next hands a page as a promise. */
export interface LinkPageProps {
  /** The share token, which is this page's whole credential (ADR 0040). */
  readonly params: Promise<{ readonly token: string }>
}

const refused = (detail: string): ReactNode => (
  <p className="py-16 text-center text-muted-foreground" role="alert">
    {detail}
  </p>
)

/**
 * The tab title: the plan's own name, which the bootstrap already carries.
 *
 * One call and not two — `PlanShareView.plan` is `{ id, name }`, so the name is in the answer the
 * page needs anyway, and no plan is read to title a tab. A refused bootstrap titles the tab without
 * a name rather than inventing one.
 */
export async function generateMetadata({ params }: LinkPageProps): Promise<Metadata> {
  const share = await readShare((await params).token)
  return { title: share.ok ? `${share.value.plan.name} · CC Guild Macroplan` : TITLE }
}

/**
 * `/s/<token>`: the one plan this token opens, read by whoever holds the URL.
 *
 * There is **one page and no dispatch**, where `apps/microtask`'s branches on its share's scope kind:
 * `PlanShareView.scope.kind` is the literal `'plan'` in the contract, a plan is shared at plan scope
 * and nothing narrower exists, and ADR 0053 defers an epic scope rather than foreclosing one. So
 * there is no list page, no `/t/<id>` equivalent, and nothing here to get wrong about which of two
 * things a token names.
 *
 * It makes **two** reads: `shares/current` to learn which plan this seat is rooted in, then that
 * plan. The bootstrap stops at the plan's `{ id, name }` on purpose (`read-share.ts`).
 *
 * The token is taken from `params` and is the only authority presented: **no cookie is read**, so an
 * admin signed in on the same browser sees exactly what the seat sees, and a page on this surface
 * cannot be elevated by one (ADR 0040). A link that no longer resolves has already been sent to
 * `/s/unavailable` by the read, never to `/login` — a seat holder has no password (ADR 0032).
 *
 * What it renders is the **same `PlanScreen` the admin plan page renders**, with no seat-facing
 * variant: the timeline and its table are what a plan is, and a second rendering of one would be a
 * second place for a span to be drawn wrong. Nothing about a seat changes it, because everything a
 * role decides on this surface is decided by the API — phase 2 draws no control a seat could be
 * refused. The clock is read once, here — `new Date()`, which is what `PlanScreen.at` takes — and
 * threaded down as the instant the today line is drawn at, as the admin page does.
 *
 * A refusal of either read is said in place of the timeline, in this surface's own words rather than
 * the API's; a plan the API no longer holds is `not-found.tsx`; and anything actually thrown is
 * `error.tsx`, which is therefore a fault boundary rather than a refusal one.
 */
export default async function LinkPlanPage({ params }: LinkPageProps) {
  const { token } = await params
  const share = await readShare(token)
  if (!share.ok) return refused(share.detail)
  const plan = await readSeatPlan(token, share.value.scope.planId)
  if (!plan.ok) return refused(plan.detail)
  return <PlanScreen at={new Date()} plan={plan.value} />
}
