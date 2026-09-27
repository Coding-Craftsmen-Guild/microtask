import { labelRows } from '../../../components/plan/labels/label-rows'
import { LabelsPanel } from '../../../components/plan/labels/labels-panel'
import type { PlanEditActions } from '../../../components/plan/edit-actions'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { railRows } from '../../../components/plan/rails/rail-rows'
import { RailsPanel } from '../../../components/plan/rails/rails-panel'
import type { PlanControls } from '../../../lib/plan-capabilities'

/**
 * The two panels a seat uses to change what the plan *holds*: its rails and its groups.
 *
 * Split from the plan's own settings and its seats because this file would otherwise be over the
 * repo's 80-line cap, and because the division is real: these two write content, the other two write
 * the plan itself and who may open it.
 */
export const seatRailsPanel = (plan: PlanScreenModel, writes: PlanEditActions, controls: PlanControls) => {
  if (!controls.content.createEpic) return null
  return (
    <RailsPanel
      create={writes.createEpic}
      createFeature={writes.createFeature}
      mayAddFeature={controls.content.createFeature}
      mayRecolour={controls.content.recolourEpic}
      mayRemove={controls.content.removeEpic}
      mayRename={controls.content.renameEpic}
      mayReorder={controls.content.reorderEpic}
      planId={plan.id}
      recolour={writes.recolourEpic}
      remove={writes.removeEpic}
      rename={writes.renameEpic}
      reorder={writes.reorderEpic}
      rows={railRows(plan)}
    />
  )
}

/** The groups of the plan, for a seat that may make one. Nothing for one that may not. */
export const seatGroupsPanel = (plan: PlanScreenModel, writes: PlanEditActions, controls: PlanControls) => {
  if (!controls.content.createLabel) return null
  return (
    <LabelsPanel
      create={writes.createLabel}
      mayRecolour={controls.content.recolourLabel}
      mayRemove={controls.content.removeLabel}
      mayRename={controls.content.renameLabel}
      planId={plan.id}
      recolour={writes.recolourLabel}
      remove={writes.removeLabel}
      rename={writes.renameLabel}
      rows={labelRows(plan)}
    />
  )
}
