import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DependencyEditor } from './dependency-editor'
import { EDITS } from './field'
import { PinField } from './pin-field'
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

  /** Every write of plan content, of which this hands two to the browser. */
  readonly actions: PlanEditActions
}

/**
 * The controls a `manage` seat has and a `write` seat does not: the pin, and what a feature waits on.
 *
 * ### One container per capability tier, which is the cut the pin already made visible
 *
 * `./drawer-edits.tsx` holds the three `write`-tier fields — `feature:rename`, `feature:estimate`,
 * `item:describe` — and every control in **this** band is granted to `manage` alone: `feature:pin` and
 * `feature:depend` today, with `feature:place`, `item:place`, `feature:delete` and `item:delete` to
 * follow (`MANAGE` and `WRITE` in `packages/kernel/src/access/policy.ts`). So a seat holding `write`
 * and not `manage` is shown exactly one of the two bands, and that is a fact of the file layout rather
 * than a condition anyone has to keep in step.
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
 * ### Two of these controls are a feature's alone, and one pair will not be
 *
 * `row.kind === 'feature'` guards both of today's, and the contract is what makes that the right
 * question rather than a convenience: `PlanFeature` carries `pinSprint` and `dependsOn` where
 * `PlanItem` carries neither (`packages/contracts/src/plan.ts`), and spec §3.1 argues that edges exist
 * at the feature level and nowhere else because a feature is the contiguous block an edge can mean
 * something between. So the item drawer has **no** dependency control at all, and none to come. The
 * delete and place groups queued behind these two are a different case — `item:place` and
 * `item:delete` are real actions of both kinds — which is why this file asks the kind per control
 * rather than once at the top, and why it must not split by row kind.
 */
export function DrawerManage({ planId, row, values, controls, actions }: DrawerManageProps) {
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
    </div>
  )
}
