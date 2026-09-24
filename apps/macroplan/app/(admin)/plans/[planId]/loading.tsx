/**
 * What a navigation into a drawer shows before that drawer is ready: nothing a sighted user would
 * call a loading state.
 *
 * This is the **drawer's** boundary and not the plan's, which is a fact about where Next puts it: a
 * `loading.tsx` beside a `layout.tsx` "creates a Suspense boundary around each of a layout's child
 * slots" (`next/dist/client/components/layout-router.js`), so the canvas and the table are already on
 * screen and stay there while this is up. There is therefore nothing for a sighted user to wait for
 * and nothing to draw — the app being replaced had no skeletons or spinners anywhere, and one here
 * would animate a guess at a panel whose contents have not arrived.
 *
 * What is left is the reader who cannot see the canvas stay put, so the one thing here is a status
 * they are told about. It does not name the subject: the name is a fact from the plan, which is
 * exactly what has not arrived yet.
 *
 * `role="status"` and no `aria-live`. The role already carries `aria-live="polite"` in the ARIA
 * specification's own definition of it, so spelling both is one behaviour written twice — two
 * attributes to keep in step for nothing, and a reader of this file left wondering which one the
 * announcement depends on.
 */
export default function PlanDrawerLoading() {
  return (
    <p className="sr-only" role="status">
      Loading…
    </p>
  )
}
