import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ADMIN_PLAN_ACTIONS } from '../../../../components/plan/admin-actions'
import { ConflictList } from '../../../../components/plan/conflicts/conflict-list'
import { PlanScreen } from '../../../../components/plan/plan-screen'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'
import { readPlan } from './read-plan'

/** Props for {@link PlanLayout}. */
export interface PlanLayoutProps {
  /** `planId` from `/plans/[planId]`, untrusted until the API has read it. */
  readonly params: Promise<{ readonly planId: string }>

  /**
   * The drawer slot: `page.tsx` with nothing selected, or one of `f/[featureId]` and `i/[itemId]`.
   *
   * A layout cannot pass a prop to its children, which is exactly why the plan read below is
   * `cache()`d rather than threaded: each drawer page reads the plan itself and gets this render's
   * answer (`read-plan.ts`).
   */
  readonly children: ReactNode
}

/**
 * The tab title for every page under this segment: the plan's name, then the product.
 *
 * It is the **layout's** and no longer the page's, because a drawer route is a page too — a title
 * left on `page.tsx` would name the plan with nothing selected and name nothing at all once a
 * feature was open. `readPlan` is `cache()`d, so this shares the one read the render below makes.
 */
export async function generateMetadata({ params }: Pick<PlanLayoutProps, 'params'>): Promise<Metadata> {
  const loaded = await readPlan((await params).planId)
  return {
    title: loaded.ok ? `${loaded.value.name} · CC Guild Macroplan` : 'Plan · CC Guild Macroplan',
  }
}

/**
 * `/plans/[planId]`: one plan's timeline and its table, with a slot beside them for whatever is
 * selected.
 *
 * ### Why the canvas is here and not on the page
 *
 * **A layout does not re-render when navigation moves between its children.** Opening a feature is
 * therefore one soft navigation that re-renders the drawer alone, where a page holding both would
 * rebuild the whole screen — 2,000-odd SVG nodes and, at this product's cap, 2,200 table rows — to
 * show one panel. That is the whole reason the drawer is a route rather than a piece of client state,
 * and it is why this file exists.
 *
 * It reads `plans.read()` **once**, shared with `generateMetadata` and with whichever drawer page is
 * mounted through `React.cache` (`read-plan.ts`, keyed on `planId`). On a cold load the layout and
 * the drawer therefore make one call between them; on a soft navigation the layout does not render
 * at all and the drawer's own `readPlan` is the one read of that request. A layout cannot hand its
 * children a prop, so this sharing is what replaces one — and it only holds while every caller asks
 * with the same key, which is why no caller passes its own pathname in.
 *
 * That one response carries the whole plan and the schedule derived from it — the API computes a
 * schedule on read and never stores one (ADR 0048, spec §3.4) — so there is no second call to make
 * and nothing here to recompute. Nothing re-derives a span, a rail order or an x.
 *
 * The clock is read once, here — `new Date()`, which is what `PlanScreen.at` takes — and threaded
 * down as the instant the today line is drawn at, as the `/s/<token>` page does. The canvas takes it
 * as a prop rather than reading the clock itself, which is what `todayLine` in `@repo/canvas` asks of
 * a caller — "A caller reads the clock; this reads the caller" — and is why a test can pin a date and
 * get one answer.
 *
 * What it hands down is **not** what the API answered. `plans.read()` serves an admin every seat on
 * the plan and its live token, and `read-plan.ts` reduces that to a `PlanScreenModel` whose type
 * cannot hold one — so there is no share token in these props for the Flight payload to carry, and
 * none for a client component added inside `PlanScreen` to drag into the HTML (ADR 0033). That is the
 * same type `PlanScreen` takes and the same one `/s/<token>` reduces to, so the guarantee is one
 * compiler check on both surfaces rather than a mechanism per page.
 *
 * ### The conflict list is filled here, and that is what makes it the admin's
 *
 * `PlanScreen.conflicts` is a slot for the same reason its `drawer` is one, and the reason is not
 * layout: every link a conflict row draws is an **admin** drawer path, and `/s/<token>` renders the
 * same screen — so a list mounted inside that component would put links behind a login on a surface
 * whose holder has no password (ADR 0032). This layout is the one place that knows it is the admin
 * surface, so this is where the list is built. It is filled from the **same** `loaded.value` the screen
 * is handed, so the rows cannot be derived from a second read of the plan, and it is built here rather
 * than in `page.tsx` so that it stays on screen while a drawer route moves in and out of the slot
 * beside it — a layout not re-rendering when navigation moves between its children is the whole reason
 * this file exists, and a conflict list is about the plan rather than about what is selected.
 *
 * What it hands down about authority is {@link ADMIN_CONTROLS} and not a principal: the admin is not
 * a role in the capability model, so there is no role to pass and nothing for the screen to derive
 * one from (`lib/admin-controls.ts`). The seat page asks `planCapabilities` for its own answers and
 * hands down the same shape, which is what lets one screen serve both audiences.
 *
 * It also hands down `ADMIN_PLAN_ACTIONS`, and this is the first **page** in this app to hand a component a
 * Server Action. Every member is a module function imported by name, so reflection can see all there is to
 * see of one, and `layout.test.tsx` asserts exactly that: the eighteen names and nothing beginning with
 * `bound `, which is what `Function.prototype.bind` would name a closure carrying a credential (ADR 0040).
 * The screen spends one of them — `placeFeature`, which the canvas's drag sends — and the drawer pages get
 * their own copy of the object rather than this one, a layout being unable to hand its children a prop.
 * `/s/<token>` hands `null` instead, and its own page says why.
 *
 * ### The two refusals, and which page each lands on
 *
 * A plan the API does not hold, and an id that is not a ULID, are both `notFound()` — argued in
 * `read-plan.ts` — and because a segment's own `not-found.tsx` renders *inside* its layout, that call
 * escapes this file to the boundary above it: `app/(admin)/plans/not-found.tsx`. The boundary in this
 * directory is the **drawer's**, for a feature or an item that is gone, and it keeps the canvas on
 * screen precisely because it renders inside here.
 *
 * Every other refusal is said in place of the timeline, in this surface's own words rather than the
 * API's, and **without the slot**: the drawer page would meet the same refusal from the same cached
 * read, so rendering `children` here would say one thing twice. An expired session redirects to
 * `/login?next=/plans/<id>` from inside `adminCall`, so the admin lands back on the plan they were
 * reading — on the plan and not on the drawer, since the path in that redirect is the cache key's.
 */
export default async function PlanLayout({ params, children }: PlanLayoutProps) {
  const loaded = await readPlan((await params).planId)
  if (!loaded.ok) {
    return (
      <p className="py-16 text-center text-muted-foreground" role="alert">
        {loaded.detail}
      </p>
    )
  }
  return (
    <PlanScreen
      actions={ADMIN_PLAN_ACTIONS}
      at={new Date()}
      conflicts={<ConflictList plan={loaded.value} />}
      controls={ADMIN_CONTROLS}
      drawer={children}
      plan={loaded.value}
    />
  )
}
