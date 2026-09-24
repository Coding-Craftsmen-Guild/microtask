import Link from 'next/link'

/**
 * A plan id that names nothing: deleted, mistyped, or not an id at all.
 *
 * One page for all three, because the three are one sentence to the admin who arrived here and the
 * difference between them — a 404 for a plan the workspace does not hold, a 422 for a segment that is
 * not a ULID — is a fact about the API's validator rather than about the plan they were looking for.
 *
 * It offers the way back to the index rather than leaving the generic 404, for the reason Microtask's
 * project page does the same: an admin here most likely followed a link to a plan somebody has since
 * deleted, and the list is where they find out what is left.
 *
 * ### Why it sits on `plans` and not on `[planId]`
 *
 * It lived one directory down until the plan read moved into `[planId]/layout.tsx`. A segment's own
 * `not-found` element is rendered **inside** that segment's layout — Next hands it to the
 * `LayoutRouter` built for the layout's `children` slot (`create-component-tree.js`) — so a
 * `notFound()` thrown by the layout itself cannot land there: it escapes to the nearest boundary
 * above, which is this one. Left in place it would have been asked to render beside a canvas that
 * could not be drawn, for want of the very plan it is reporting missing.
 *
 * A directory with no `layout.tsx` and no `page.tsx` still carries a boundary: the same function
 * builds the segment's `LayoutRouter`, `notFound` element and all, before it checks whether the
 * segment has a component of its own. So this frames the sentence in the admin surface's own bar and
 * page column, one level up, with no plan around it — and `[planId]/not-found.tsx` is the drawer's,
 * which keeps the plan on screen because it renders inside the layout.
 */
export default function PlanNotFound() {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <h1 className="text-xl font-semibold">Plan not found</h1>
      <p className="text-muted-foreground">It may have been deleted, or the link may be wrong.</p>
      <Link className="text-brand" href="/">
        ← Plans
      </Link>
    </div>
  )
}
