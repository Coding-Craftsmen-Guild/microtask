/**
 * A derivation of the plan computed once per plan object, however many components ask for it.
 *
 * It replaces React's `cache()` on the plan screen's derived rows (`../table/rows.ts`,
 * `../canvas/detail-lines.ts`) and on its attention map. `cache()` memoises for one **server** request and
 * is a pass-through in a client bundle, and the screen is drawn in the browser now (ADR 0069) — where the
 * same rows were being derived again by every component that wanted them, on every render.
 *
 * Keyed on the plan object itself, in a `WeakMap`, which is the right key for a reason the store supplies:
 * it makes a new plan object exactly when the plan changes and hands the same one back otherwise. So a zoom,
 * a view switch or a drawer derives nothing, an edit derives everything once, and a plan nothing points at
 * any more is collected with whatever was derived from it.
 *
 * @param derive - A pure function of the plan.
 * @returns The same function, remembered per plan object.
 */
export function memoOnPlan<Plan extends object, Value>(derive: (plan: Plan) => Value): (plan: Plan) => Value {
  const kept = new WeakMap<Plan, Value>()
  return (plan) => {
    if (kept.has(plan)) return kept.get(plan) as Value
    const made = derive(plan)
    kept.set(plan, made)
    return made
  }
}
