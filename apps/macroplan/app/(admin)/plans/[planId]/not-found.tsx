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
