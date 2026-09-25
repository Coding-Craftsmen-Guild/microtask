import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { PlanScreen } from '../../../components/plan/plan-screen'
import { planCapabilities } from '../../../lib/plan-capabilities'
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
 * second place for a span to be drawn wrong. What differs between the two audiences is which controls
 * are drawn, and that is one prop rather than a second component. The clock is read once, here —
 * `new Date()`, which is what `PlanScreen.at` takes — and threaded down as the instant the today line
 * is drawn at, as the admin page does.
 *
 * `conflicts={null}` is the same sentence about the other slot, and it is the same missing pages that
 * make it true. A conflict row's whole point is a link to the control that fixes it, and every builder
 * in `lib/drawer-routes.ts` addresses `/plans/<planId>/…` — so drawing the list here would hand a seat
 * holder links to a surface that answers a cookie they cannot have and would redirect them to a login
 * with no password behind it (ADR 0032). The two `null`s therefore arrive and leave together: whoever
 * adds `/s/<token>/f/<featureId>` gains both a drawer to open and a list that can link to it, and both
 * lines here are compile errors that day rather than a screen quietly missing two things.
 *
 * `drawer={null}` is this page **saying** it has no drawer, rather than leaving the prop off. The slot
 * is required on `PlanScreen` for that reason: `/s/<token>/f/<featureId>` and `/s/<token>/i/<itemId>`
 * are a later task — their builders are deliberately absent from `lib/drawer-routes.ts` until the
 * pages exist — and on the day they arrive this one line is a compile error rather than a seat screen
 * that goes on rendering without the panel it now has routes for.
 *
 * `share={null}` is the fourth, and it is the one that costs this surface something a seat may actually
 * do. `planCapabilities` answers a plan-scoped `manage` seat **`true` on all four `share:*` questions** —
 * `share:read`, `share:update` and `share:revoke` through `mayReach` with `'plan'`, and `share:create` off
 * the record — so such a holder may legitimately administer this plan's other seats (ADR 0038, ADR 0053),
 * and the manager it would open is built and tested. What is missing is the credential: every one of its
 * four actions would have to carry **this** seat's token, which is the whole of its authority (ADR 0040),
 * and a token cannot cross into a client component as a prop while binding it into an action hides it from
 * the sweep below — `page.test.tsx` asserts this surface hands over no function at all for exactly that
 * reason, and `module-boundaries.test.tsx` refuses any `bound `-prefixed function on the other side. So
 * this `null` and `actions={null}` are the same unfinished sweep rather than two decisions, and they lift
 * together: the task that teaches either walker to read a bound function's arguments is the task that
 * mounts a seat's own writes and its own manager.
 *
 * `actions={null}` is a third such sentence, and its reason is narrower than a tier. A seat holding
 * `manage` may place a feature, so the canvas's drag is a control this surface will eventually draw — but a
 * seat's writes are bound to its token (`components/plan/seat-actions.ts`), and this page's own leak sweep
 * cannot read a bound function's arguments: `page.test.tsx` records that as a KNOWN GAP and asserts
 * instead that this surface hands over **no function at all**. Mounting the seat's writes is therefore the
 * task that widens that sweep, and until then a seat holding `manage` reorders from the drawer's own
 * controls rather than by dragging. Required and not optional, for the reason `drawer` is: this line is
 * what makes that a decision somebody wrote down.
 *
 * ### What the bootstrap's answer is spent on, and what is not handed down
 *
 * `PlanShareView` carries three things — `role`, `scope` and `plan: { id, name }` — and all three are
 * used here: the scope's `planId` says which plan to read, the name titles the tab, and the role and
 * the scope together are what `planCapabilities` needs. The scope is passed rather than rebuilt from
 * the id because a `ScopeValue` carries the id the kernel compares, and the answers are for the
 * plan the *API* said this seat is rooted in (ADR 0038, ADR 0053).
 *
 * **The controls go down; the role, the scope and the view itself do not.** A boolean set is a
 * decision already made, so nothing under the screen can re-derive a permission from a
 * credential-shaped value, and a component added later cannot ask a second question of a role it was
 * never given. None of the three could leak the token either — the bootstrap answers no token at all,
 * and the plan read's `shareLinks` block is dropped on the server by `read-share.ts` before this
 * function sees it — but a role in the Flight payload is a permission restated where nothing
 * authorises it, which is the shape ADR 0033's second amendment refuses to rely on the tree to
 * prevent. The leak sweep in `page.test.tsx` is what proves the token half of that, token by token.
 *
 * A refusal of either read is said in place of the timeline, in this surface's own words rather than
 * the API's; a plan the API no longer holds is `not-found.tsx`; and anything actually thrown is
 * `error.tsx`, which is therefore a fault boundary rather than a refusal one.
 */
export default async function LinkPlanPage({ params }: LinkPageProps) {
  const { token } = await params
  const share = await readShare(token)
  if (!share.ok) return refused(share.detail)
  const { role, scope } = share.value
  const plan = await readSeatPlan(token, scope.planId)
  if (!plan.ok) return refused(plan.detail)
  return (
    <PlanScreen
      actions={null}
      at={new Date()}
      conflicts={null}
      controls={planCapabilities(role, scope)}
      drawer={null}
      plan={plan.value}
      share={null}
    />
  )
}
