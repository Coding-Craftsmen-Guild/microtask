import { edgeChoices, type CycleFeature } from './cycle-check'
import { DependencyToggle } from './dependency-toggle'
import { BUDGET, LABEL, NOTHING_TO_WAIT_ON, type SubjectWrite } from './field'

const GROUP = 'grid gap-1 border-0 p-0'

const LIST = 'grid list-none gap-2 p-0'

/** Props for {@link DependencyEditor}. */
export interface DependencyEditorProps {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The feature the drawer is open on, whose dependency list this edits. */
  readonly featureId: string

  /** Every feature of the plan: the graph a cycle is a property of, and the candidate list itself. */
  readonly features: readonly CycleFeature[]

  /** Replaces the whole set this feature waits on; the API refuses a cycle as a 409. */
  readonly setDependencies: SubjectWrite<readonly string[]>
}

/**
 * What one feature waits on, as a box per other feature of the plan.
 *
 * ### Edges exist at the feature level and nowhere else
 *
 * There is no item form of this control and there will not be one. Spec §3.1 says why: a feature is a
 * contiguous block, and "contiguity is what makes an edge between two features mean something at the
 * year rung, and it is why edges exist at the feature level and nowhere else". `PlanItem` carries no
 * `dependsOn` at all (`packages/contracts/src/plan.ts`), so the omission is the contract's rather than
 * this component's, and `./drawer-manage.tsx` asks `row.kind === 'feature'` before mounting this.
 *
 * The candidate list is **this plan's features and never a search**. Spec §8 records cross-plan
 * dependencies as rejected and ADR 0050 is the rule behind it — an id naming something outside the
 * plan is refused rather than followed — so every candidate there could ever be is already in the
 * `features` prop, and nothing here has anywhere else to look. A plan holding one feature gets
 * {@link NOTHING_TO_WAIT_ON} rather than an empty list, an empty control being indistinguishable from
 * a broken one.
 *
 * ### The whole list, because the route replaces it
 *
 * `PUT .../dependencies` takes a complete `dependsOn` and there is no add and no remove, so the model
 * of this control is the feature's current list plus or minus one, sent entire. **Two editors on one
 * feature therefore lose a write**: each sends a complete list built from the plan it rendered, the
 * second overwrites the first, and nothing tells either of them — the route takes no `If-Match`
 * (`packages/api-client/src/operations/features.ts`).
 *
 * ### This file stays on the server, and that is what makes the rows crossable
 *
 * `./cycle-check.ts` is called here, once per candidate, and each answer is one
 * `EdgeChoice` of primitives: the candidate's id and name, whether the edge is stated, the whole list
 * that click would send as a string, and the refusal that click would meet or `''`. That is what
 * crosses into the browser, row by row, because a client component may be handed primitives, an
 * unbound function or `null` and a **list of features is none of those**
 * (`../module-boundaries.test.tsx`). Keeping the walk here is also what keeps `findCycles` out of the
 * browser bundle: `./dependency-toggle.tsx` imports its codec from `./field.ts`, which names
 * `@repo/contracts` and nothing else.
 *
 * ### A fieldset, because the rows are one question
 *
 * The `<legend>` is the group's name — "Waits on", which is what an edge means rather than what the
 * field is called — and each box keeps its own `<label>` through {@link DependencyToggle}'s
 * `FieldShell`, so a reader tabbing onto one hears the candidate's name and, while a refusal stands,
 * the refusal as its description. A `<legend>` alone would name the group and leave the boxes
 * unnamed; a label alone would leave a reader landing on the third box with no idea what the list is.
 */
export function DependencyEditor({
  planId,
  featureId,
  features,
  setDependencies,
}: DependencyEditorProps) {
  const choices = edgeChoices(features, featureId)
  return (
    <fieldset className={GROUP}>
      <legend className={LABEL}>Waits on</legend>
      {choices.length === 0 ? <p className={BUDGET}>{NOTHING_TO_WAIT_ON}</p> : null}
      <ul className={LIST}>
        {choices.map((choice) => (
          <li key={choice.featureId}>
            <DependencyToggle
              candidateId={choice.featureId}
              candidateName={choice.name}
              featureId={featureId}
              planId={planId}
              refusal={choice.refusal}
              sendIds={choice.sendIds}
              setDependencies={setDependencies}
              waiting={choice.waiting}
            />
          </li>
        ))}
      </ul>
    </fieldset>
  )
}
