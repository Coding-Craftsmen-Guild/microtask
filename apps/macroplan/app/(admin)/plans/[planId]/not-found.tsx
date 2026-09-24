/**
 * A feature or an item id that names nothing on this plan: deleted, or a link that has gone stale.
 *
 * ### The canvas stays on screen, and that is not luck
 *
 * Next hands a segment's `not-found` element to the `LayoutRouter` it builds for that segment's
 * `children` slot — `notFoundComponent` in `next/dist/server/app-render/create-component-tree.js`,
 * wrapped as an `HTTPAccessFallbackBoundary` inside it — and this segment's `children` slot is what
 * `layout.tsx` renders beside the timeline. So this page renders *inside* that layout: the plan's
 * name, its timeline and its table are all still there, and only the drawer is replaced. A boundary
 * one directory up would have taken the plan off the screen along with the panel.
 *
 * The same placement is why this is **not** the page a mistyped plan id reaches. `readPlan` calls
 * `notFound()` from inside the layout itself, which is outside the boundary the layout renders, so
 * that call escapes to `app/(admin)/plans/not-found.tsx` — which says the plan is not there, in the
 * frame with no plan in it. Two boundaries because they are two different sentences.
 *
 * It offers no way back, and cannot: a `not-found.tsx` is handed no params, so this file cannot know
 * which plan it is beside. It needs none — the plan is on screen next to it.
 */
export default function PlanDrawerNotFound() {
  return (
    <p className="text-[13px] text-muted-foreground" data-slot="drawer-not-found">
      That is no longer on this plan. It may have been deleted, or the address may be wrong.
    </p>
  )
}
