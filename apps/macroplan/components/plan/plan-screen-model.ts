import type { Plan } from '@repo/api-client'

/**
 * Everything {@link PlanScreen} renders a plan from — and **no share token**.
 *
 * `plans.read()` answers a cleared caller with every seat on the plan and its live token, because
 * the API's view is the one place that decides who may see them (ADR 0013): `visibleLinks` shapes
 * the block per caller, and `packages/macroplan-domain/src/views/view-leaks.test.ts` requires a
 * plan-scoped `manage` holder to be shown all three of the fixture's seats. Neither surface that
 * renders a plan needs one. Anything a Server Component hands a component is serialised into the
 * Flight payload and lands in the HTML, and ADR 0033 is explicit that such a block "may not be
 * rendered into a **page**" — caller-independent, clearance being that ADR's premise rather than an
 * exemption from it, and its second amendment rejects relying on the tree happening to be
 * server-only.
 *
 * `shareLinks?: never` is what makes this a **compiler** guarantee rather than a leak sweep's. An
 * `Omit` on its own would be worth nothing: a `Plan` is structurally assignable to
 * `Omit<Plan, 'shareLinks'>`, since TypeScript checks for excess properties only on fresh object
 * literals, so a read shortened to `return plan` would compile and ship. The intersection closes
 * that, because `readonly PlanShareLink[]` is assignable to nothing but itself — the mutation
 * fails with `TS2375`. A runtime `delete` or a rest strip would compile either way.
 *
 * It is `Omit`-derived rather than spelled out for the reason `ProjectListItem` is
 * `ProjectView.omit({ shareLinks: true })` in `packages/contracts/src/views.ts`: a field added to
 * `PlanView` appears here too, so {@link planScreenModel}'s literal below fails to compile until
 * somebody decides whether a page may carry it. The omission is spelled in the app rather than
 * beside the contract because it is these *surfaces'* decision — the same `PlanView` must keep its
 * seats for the phase 3 share manager that asks for them deliberately.
 *
 * It lives beside `plan-screen.tsx` and not in `lib/` because it **is** that component's prop type:
 * `lib/` holds this app's session, routing and API plumbing, and neither route segment may sensibly
 * import the other's module. One type here is what makes a token unrepresentable on both surfaces
 * at once, rather than two parallel mechanisms that have to be kept in step.
 */
export type PlanScreenModel = Omit<Plan, 'shareLinks'> & { readonly shareLinks?: never }

/**
 * Reduces a caller's view of a plan to what a page may carry, on the server.
 *
 * Every field is copied **by name** and never spread, which is the shape
 * `apps/microtask/components/projects/page-model.ts` established and ADR 0033's second amendment
 * asks for. A rest strip names one field and carries whatever the view gains next; naming each
 * field means a new block on `PlanView` arrives here as a type error rather than as a silent
 * passenger in the page source.
 *
 * The copy is unconditional, so a caller the API refused the block gets the same model as one it
 * served — and an absent `shareLinks` cannot become a present-but-`undefined` one under
 * `exactOptionalPropertyTypes`, because the key is never written.
 */
export function planScreenModel(plan: Plan): PlanScreenModel {
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
