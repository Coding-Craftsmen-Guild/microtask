import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DeleteControl } from './delete-control'
import { EDITS } from './field'
import { FeatureManage } from './feature-manage'
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

  /** Every write of plan content, which this spends through the two groups it mounts. */
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
 * The controls a `manage` seat has and a `write` seat does not: the pin, the group, and what a feature
 * waits on.
 *
 * ### One container per capability tier, which is the cut the pin already made visible
 *
 * `./drawer-edits.tsx` holds the three `write`-tier fields — `feature:rename`, `feature:estimate`,
 * `item:describe` — and every control in **this** band is granted to `manage` alone: `feature:pin`,
 * `feature:label`, `feature:depend`, `feature:delete`, `item:delete`, `feature:place` and `item:place`
 * (`MANAGE` and `WRITE` in `packages/kernel/src/access/policy.ts`). So a seat holding `write`
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
 * ### Three groups, and none of them tests the row kind here
 *
 * What this file mounts is three groups and no individual control, which is the shape the fifty-line cap
 * forced and the right one anyway. `./feature-manage.tsx` holds the three controls a **feature** has and
 * an item cannot — the pin, the group and the dependency editor, because `PlanFeature` carries
 * `pinSprint`, `labelId` and `dependsOn` and `PlanItem` carries none of the three. `./place-controls.tsx`
 * holds the two placements, where the kind chooses the *write* rather than whether to draw at all. The
 * delete is the same shape as a placement and is the one control still mounted directly, on
 * `removalFor`'s answer (`./subject-writes.ts`), because `removeFeature` and `removeItem` take ids the
 * compiler cannot tell apart and a delete sent to the wrong route is the one mistake in this band that
 * cannot be taken back.
 *
 * So no `row.kind` test lives in this file any more, and that is the point of the arrangement rather than
 * a side effect: a group that asks the kind itself cannot fall out of step with a parent that also asks
 * it, and each group draws nothing rather than being conditionally mounted — which is what keeps this
 * container's own `empty:hidden` honest for a seat that may write none of it.
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
      <FeatureManage
        actions={actions}
        controls={controls}
        planId={planId}
        row={row}
        values={values}
      />
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
