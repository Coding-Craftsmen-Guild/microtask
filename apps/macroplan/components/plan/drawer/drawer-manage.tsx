import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DeleteControl } from './delete-control'
import { DependencyEditor } from './dependency-editor'
import { EDITS } from './field'
import { PinField } from './pin-field'
import { PlaceControls } from './place-controls'
import { removalFor } from './subject-writes'
import type { DrawerValues } from './values'

/** Props for {@link DrawerManage}. */
export interface DrawerManageProps {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The subject: its `kind` decides which of these controls exist for it at all. */
  readonly row: TableRow

  /** The same subject's values, resolved out of the same plan (`./subject.ts`). */
  readonly values: DrawerValues

  /** Which of these controls this surface draws. Never a gate (`lib/plan-capabilities.ts`). */
  readonly controls: PlanContentControls

  /** Every write of plan content, of which this hands three to the browser. */
  readonly actions: PlanEditActions

  /**
   * The plan's own path, which is where the **delete** goes once the subject is gone.
   *
   * Threaded from the panel rather than built from `planId` here, because the page that set it is the
   * one that knows which surface it is on: `/plans/<planId>` is an admin address, and a seat holder sent
   * there meets a cookie surface and a login with no password behind it (`./delete-control.tsx`).
   */
  readonly closeHref: string
}

/**
 * The controls a `manage` seat has and a `write` seat does not: the pin, and what a feature waits on.
 *
 * ### One container per capability tier, which is the cut the pin already made visible
 *
 * `./drawer-edits.tsx` holds the three `write`-tier fields — `feature:rename`, `feature:estimate`,
 * `item:describe` — and every control in **this** band is granted to `manage` alone: `feature:pin`,
 * `feature:depend`, `feature:delete` and `item:delete` today, with `feature:place` and `item:place` to
 * follow (`MANAGE` and `WRITE` in `packages/kernel/src/access/policy.ts`). So a seat holding `write`
 * and not `manage` is shown exactly one of the two bands, and that is a fact of the file layout rather
 * than a condition anyone has to keep in step.
 *
 * The one control group that is **not** in either band is create, and it is the exception that proves the
 * split is about tiers *of writes about the subject*: `feature:create` and `item:create` are `write`
 * actions, but a create is addressed at a parent rather than at this subject, so it is a third sibling
 * `./drawer-panel.tsx` mounts (`./create-controls.tsx`).
 *
 * It opens **here** rather than with the group after this one, and the reason is arithmetic that the
 * dependency editor is the first to make binding. `./drawer-edits.tsx` stood at 62 of its 80 counted
 * lines with the pin in it and three groups still queued — this editor, delete, and the two place
 * actions — against 18 free lines, where a group costs about eleven mounted and never four. That file
 * would have been over its cap before the phase ended, and the cap is not the thing to shave: what was
 * missing while the pin was the only `manage`-tier control was a **second member**, because a container
 * holding one control cannot make its own argument, let alone have it tested. This editor is that
 * second member, so the band and its argument arrive together, and the pin moves in with it.
 *
 * ### A sibling of the write band, not a child of it
 *
 * Both bands are drawn by `./drawer-panel.tsx` as siblings inside its own grid, each in the {@link
 * EDITS} band with its own `empty:hidden`: a surface that may write nothing in a tier is shown no
 * bordered box for that tier, and a read-only seat sees neither. That is a variant rather than a
 * count, so the condition cannot fall out of step with the controls inside it.
 *
 * ### Two of these controls are a feature's alone, and the third is not
 *
 * `row.kind === 'feature'` guards the pin and the dependency editor, and the contract is what makes that
 * the right question rather than a convenience: `PlanFeature` carries `pinSprint` and `dependsOn` where
 * `PlanItem` carries neither (`packages/contracts/src/plan.ts`), and spec §3.1 argues that edges exist
 * at the feature level and nowhere else because a feature is the contiguous block an edge can mean
 * something between. So the item drawer has **no** dependency control at all, and none to come.
 *
 * The delete is the other case, and it is why this file asks the kind per control rather than once at the
 * top: `feature:delete` and `item:delete` are both real, so the control is drawn for both kinds and the
 * **kind chooses the write**. That choice is `removalFor`'s and never a caller's (`./subject-writes.ts`),
 * because `removeFeature` and `removeItem` take ids of types the compiler cannot tell apart and a delete
 * sent to the wrong route is the one mistake in this band that cannot be taken back. `item:place` is the
 * same shape of control, which is the second reason this file must not split by row kind. Both have now
 * arrived, in one group that asks the kind for both halves of the answer — `./place-controls.tsx`, which is
 * mounted here unconditionally and draws nothing where the kind, the controls or the parent say so. That
 * group is the **third** in this band, and it makes the file's own argument concrete: every control here is
 * `manage`-tier, and a seat holding `write` and not `manage` is shown this whole band or none of it.
 */
export function DrawerManage({
  planId,
  row,
  values,
  controls,
  actions,
  closeHref,
}: DrawerManageProps) {
  const removal = removalFor(row.kind, controls, actions)
  return (
    <div className={EDITS}>
      {row.kind === 'feature' && controls.pinFeature ? (
        <PinField
          featureId={row.id}
          pin={actions.pinFeature}
          pinSprint={values.pinSprint}
          planId={planId}
          sprintLengthDays={values.plan.calendar.sprintLengthDays}
          startDate={values.plan.calendar.startDate}
          timezone={values.plan.calendar.timezone}
        />
      ) : null}
      {row.kind === 'feature' && controls.setDependencies ? (
        <DependencyEditor
          featureId={row.id}
          features={values.plan.features}
          planId={planId}
          setDependencies={actions.setDependencies}
        />
      ) : null}
      <PlaceControls
        actions={actions}
        controls={controls}
        planId={planId}
        row={row}
        values={values}
      />
      {removal.deletable ? (
        <DeleteControl
          closeHref={closeHref}
          kind={row.kind}
          name={values.name}
          planId={planId}
          remove={removal.remove}
          subjectId={row.id}
        />
      ) : null}
    </div>
  )
}
