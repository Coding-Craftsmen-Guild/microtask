import type { Plan } from '@repo/api-client'

/**
 * Everything the admin plan page may hand a component — and **no share token**.
 *
 * `plans.read()` answers an admin with every seat on the plan and its live token, because the API's
 * view is the one place that decides who may see them (ADR 0013): `visibleLinks` shapes the block
 * per caller, and `packages/macroplan-domain/src/views/view-leaks.test.ts` requires a cleared caller
 * to be shown all of them. The page needs none. Anything a Server Component hands a client component
 * is serialised into the Flight payload and lands in the HTML, and ADR 0033 is explicit that such a
 * block "may not be rendered into a **page**" — caller-independent, clearance being the premise of
 * that ADR rather than an exemption from it. Its second amendment rejects relying on the tree
 * happening to be server-only, so the tokens stop here instead.
 *
 * `shareLinks?: never` is what makes this a **compiler** guarantee rather than a test's. A `Plan`
 * with the block is not assignable to this type, so {@link planPageModel} cannot be shortened to
 * `return plan` and a later read cannot hand the page one by accident; a runtime `delete` or a rest
 * strip would compile either way and be checked only by a leak sweep. It is `Omit`-derived rather
 * than spelled out, for the reason `ProjectListItem` is `ProjectView.omit({ shareLinks: true })`: a
 * field added to `PlanView` appears here too, and the field-by-field copy below then fails to
 * compile until somebody decides whether the page may carry it.
 */
export type PlanPageModel = Omit<Plan, 'shareLinks'> & {
  readonly shareLinks?: never
}

/**
 * Reduces the admin's view of a plan to what its page may carry.
 *
 * Every field is copied **by name** and never spread, which is the shape
 * `apps/microtask/components/projects/page-model.ts` established and ADR 0033's second amendment
 * asks for. A spread would carry whatever the view gains next; naming each field means a new block
 * on `PlanView` is a type error here rather than a silent passenger in the page source.
 */
export function planPageModel(plan: Plan): PlanPageModel {
  return {
    id: plan.id,
    name: plan.name,
    startDate: plan.startDate,
    sprintLengthDays: plan.sprintLengthDays,
    timezone: plan.timezone,
    epics: plan.epics,
    features: plan.features,
    items: plan.items,
    schedule: plan.schedule,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  }
}
