import type { ReactNode } from 'react'
import { ConflictList } from '../../../components/plan/conflicts/conflict-list'
import { PlanScreen } from '../../../components/plan/plan-screen'
import { seatPlanActions } from '../../../components/plan/seat-actions'
import { seatPlanOwnActions, seatSeatActions } from '../../../components/plan/seat-own-actions'
import { SEAT_DRAWER_ROUTES } from '../../../lib/drawer-routes'
import { DEFAULT_ZOOM } from '../../../components/plan/canvas/zoom-view'
import { planCapabilities } from '../../../lib/plan-capabilities'
import { seatSettingsSlot, seatShareSlot } from './seat-plan-slots'
import { seatGroupsSlot, seatRailsSlot } from './seat-slots'
import { readSeatBridge } from './read-seat-item'
import { readSeatPlan, readShare } from './read-share'

const refused = (detail: string): ReactNode => (
  <p className="py-16 text-center text-muted-foreground" role="alert">
    {detail}
  </p>
)

/**
 * The one plan a token opens, drawn with whatever is open beside it.
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
 * ### Every slot is filled, and the one that never could be is gone
 *
 * There was a `bridge={null}` here, and it was `null` **for ever** rather than for want of work: no seat of
 * any role holds `epic:bind`, an epic's binding being the ceiling on everything a seat reaches in Microtask
 * through the bridge (design §7.3). The slot itself has since gone from `PlanScreen` — a rail's binding is
 * one rail's concern and belongs in that rail's drawer rather than in a plan-wide panel over forty of them
 * (design §2) — so the question of what a seat would draw there no longer arises on either surface.
 *
 * ### The zoom is the default here, and a cookie is why
 *
 * `zoom={DEFAULT_ZOOM}` rather than `readZoom()`. The admin surface keeps the chosen rung in `mp_zoom` and
 * reads it in its layout, and **this surface may not read a cookie at all**: `seat-plan.test.tsx` mocks
 * `next/headers` to throw, and that is the assertion rather than a convenience — a `/s/*` page
 * authenticates from its own URL, so a cookie read anywhere under it must fail the suite rather than pass
 * quietly, which is what stops `mp_admin` on the same browser from lending a holder's page anything
 * (ADR 0040). A zoom cookie is not a credential, but the guard is deliberately blanket so that nobody has
 * to decide case by case which cookie is safe to read here.
 *
 * So a holder reads a plan at the quarter rung and cannot change it. That is a real gap and not a
 * decision that it should not be possible: giving this surface a zoom needs a mechanism that reads no
 * cookie, and the two that would work — a rung in the path above the drawer, or three pre-rendered
 * canvases switched with CSS — are the same two the design weighs and defers in §6.3.
 *
 * `conflicts`, `drawer`, `settings` and `share` were all `null` and all for reasons that have since been
 * settled, which is worth recording because each looked like a tier and was not:
 *
 * - **`drawer`** needed a route to sit in. `/s/<token>/f/<featureId>` and `/s/<token>/i/<itemId>` exist, and
 *   the plan moved into `layout.tsx` so that opening one is a soft navigation rather than a rebuild of
 *   2,200 table rows (ADR 0057).
 * - **`conflicts`** needed links that could address this surface. The list takes a `DrawerRoutes` record
 *   now instead of importing the admin builders, so a conflict row here points at `/s/<token>/…` rather
 *   than at a page that answers a cookie a seat cannot have (ADR 0032).
 * - **`settings`** and **`share`** needed seat twins of their actions, which `actions/seat-plan.ts` and
 *   `actions/seat-seats.ts` now are. All seven are `manage`, so a `manage` seat administers the plan it was
 *   given and its other seats — the API’s own answer, not a widening taken here.
 *
 * ### The writes are mounted, and what makes that safe
 *
 * `actions` is `seatPlanActions(token)`: the same twenty-eight writes the admin surface hands over, each
 * with **this** seat's token bound in as its first argument. That is the shape ADR 0040 describes, and it
 * puts the token into this page’s Flight payload — which is admitted for one token only, the visitor’s own,
 * already in the address bar they arrived by.
 *
 * For four phases these slots were `null` because the leak sweep could not read a bound function’s
 * arguments and so asserted this surface handed over **no function at all**. That avoided the question
 * rather than answering it, and it cost a `manage` seat every write on the plan it had been given.
 * `page.test.tsx` now **calls** every action it is handed — `bind` keeps its arguments in a closure with no
 * reflective access, so calling is the only way to read them — and asserts the token each one carries is
 * this seat’s and no other, token by token against every one the API serves. Binding a different token in
 * this function fails two of those cases, which is what makes the new sweep stronger than the ban it
 * replaced rather than a relaxation of it.
 *
 * `rails` and `groups` are mounted from the same wiring (`./seat-slots.tsx`), each on the seat’s own
 * controls rather than `ADMIN_CONTROLS`. Every rail and group action is `manage`, so a `view` or `write`
 * seat draws neither panel; the chips that *select* a group are not in either and never were, being mounted
 * by `PlanHeading` from the plan itself, because selecting writes nothing.
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
 * authorises it. That is this file's own argument by analogy rather than a claim ADR 0033 makes: 0033
 * is about share **tokens** end to end, and what carries over is the shape of its rejected
 * alternative — relying on a page never passing the value to a client component is "a convention,
 * enforced by nobody". The leak sweep in `page.test.tsx` is what proves the token half of that, token by token.
 *
 * A refusal of either read is said in place of the timeline, in this surface's own words rather than
 * the API's; a plan the API no longer holds is `not-found.tsx`; and anything actually thrown is
 * `error.tsx`, which is therefore a fault boundary rather than a refusal one.
 */
export async function seatPlanScreen(token: string, drawer: ReactNode) {
  const share = await readShare(token)
  if (!share.ok) return refused(share.detail)
  const { role, scope } = share.value
  const plan = await readSeatPlan(token, scope.planId)
  if (!plan.ok) return refused(plan.detail)
  const controls = planCapabilities(role, scope)
  const writes = seatPlanActions(token)
  const own = seatPlanOwnActions(token)
  const seats = seatSeatActions(token)
  const bridge = await readSeatBridge(token, scope.planId)
  return (
    <PlanScreen
      actions={writes}
      at={new Date()}
      groups={seatGroupsSlot(plan.value, writes, controls)}
      rails={seatRailsSlot(plan.value, writes, controls)}
      conflicts={<ConflictList plan={plan.value} root={token} routes={SEAT_DRAWER_ROUTES} />}
      controls={controls}
      drawer={drawer}
      plan={plan.value}
      progress={bridge?.items ?? []}
      settings={seatSettingsSlot(plan.value, own, controls)}
      share={seatShareSlot(plan.value, seats, controls)}
      zoom={DEFAULT_ZOOM}
    />
  )
}
