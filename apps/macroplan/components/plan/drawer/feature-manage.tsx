import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { DependencyEditor } from './dependency-editor'
import { GroupField } from './group-field'
import { joinGroups } from './group-options'
import { PinField } from './pin-field'
import type { DrawerValues } from './values'

/** Props for {@link FeatureManage}. */
export interface FeatureManageProps {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The subject. An item draws nothing here at all, which is this component's whole condition. */
  readonly row: TableRow

  /** The same subject's values, resolved out of the same plan (`./subject.ts`). */
  readonly values: DrawerValues

  /** Which of these three this surface draws. Never a gate (`lib/plan-capabilities.ts`). */
  readonly controls: PlanContentControls

  /** Every write of plan content, of which this hands three to the browser. */
  readonly actions: PlanEditActions
}

/**
 * The three `manage`-tier controls that exist for a **feature** and have no item form at all.
 *
 * The contract is what makes the kind the right question rather than a convenience: `PlanFeature`
 * carries `pinSprint`, `labelId` and `dependsOn`, and `PlanItem` carries none of the three
 * (`packages/contracts/src/plan.ts`). So an item drawer has no pin, no group and no dependency editor,
 * and none of them is coming — spec §3.1 argues that an edge exists at the feature level because a
 * feature is the contiguous block an edge can mean something between, and the group is the same answer
 * reached differently: an item is inside a feature, so it is already in whatever group that feature is,
 * and a second assignment on the item could contradict it.
 *
 * Split out of `./drawer-manage.tsx` when that file's component passed ADR 0027's fifty-line cap, and
 * split **here** rather than anywhere else because these three share one condition. `PlaceControls` is
 * the precedent and the shape is deliberately the same: mounted unconditionally, asking the kind itself,
 * and drawing nothing when the answer is an item — so the parent holds no `row.kind` test that could
 * fall out of step with what is inside.
 *
 * It draws no band of its own. The three land directly in the parent's {@link EDITS} container, so a
 * feature drawer shows one bordered `manage` band rather than one per group of controls, and an item
 * drawer's band is filled by what is left (`./drawer-manage.tsx`).
 */
export function FeatureManage({ planId, row, values, controls, actions }: FeatureManageProps) {
  if (row.kind !== 'feature') return null
  return (
    <>
      {controls.pinFeature ? (
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
      {controls.labelFeature ? (
        <GroupField
          featureId={row.id}
          labelId={row.labelId}
          options={joinGroups(values.plan.labels)}
          planId={planId}
          setLabel={actions.labelFeature}
        />
      ) : null}
      {controls.setDependencies ? (
        <DependencyEditor
          featureId={row.id}
          features={values.plan.features}
          planId={planId}
          setDependencies={actions.setDependencies}
        />
      ) : null}
    </>
  )
}
