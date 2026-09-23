/**
 * A seat page's 404: the plan this token opens is no longer there.
 *
 * It is reached from one place — the plan read answering 404, or the 422 the API's validator gives an
 * id that is not a ULID — and the first is the real case: a plan deleted between the bootstrap that
 * named it and the read that fetched it. Neither is a dead **link**, which goes to `/s/unavailable`
 * instead, and the difference matters: a revoked token must not be told whether the plan it used to
 * open still exists.
 *
 * It offers no way onward. The admin's `not-found.tsx` links to the plan list, and a seat has no
 * second page to go to: `GET /plans` is admin-only (ADR 0009), the surface holds exactly one plan per
 * token, and the only other link available would be `/`, the password form (ADR 0032). The brand bar
 * above this — from `[token]/layout.tsx` — still links back to the seat's own page, which is the one
 * retry worth offering.
 */
export default function SeatPlanNotFound() {
  return (
    <div className="grid justify-items-center gap-3 py-16 text-center">
      <h1 className="text-xl font-semibold">Plan not found</h1>
      <p className="text-muted-foreground">
        The plan this link opens is no longer there. It may have been deleted.
      </p>
    </div>
  )
}
