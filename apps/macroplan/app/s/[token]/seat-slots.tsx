import { labelRows } from '../../../components/plan/labels/label-rows'
import { LabelsPanel } from '../../../components/plan/labels/labels-panel'
import type { PlanEditActions } from '../../../components/plan/edit-actions'
import type { PlanScreenModel } from '../../../components/plan/plan-screen-model'
import { railRows } from '../../../components/plan/rails/rail-rows'
import { RailsPanel } from '../../../components/plan/rails/rails-panel'
import type { PlanControls } from '../../../lib/plan-capabilities'

/**
 * The rails panel as a **seat** builds it, or `null` where this seat may not make a rail.
 *
 * The twin of `railsSlot` on the admin surface, and it exists for the reason two wirings of
 * `PlanEditActions` exist at all: the components are the same, and what differs is whose credential each
 * write carries. An admin's are Server Actions reading `mp_admin`; a seat's are the same actions with its
 * token bound in (`components/plan/seat-actions.ts`).
 *
 * ### What a seat may actually do here, which is more than nothing and less than everything
 *
 * Every rail action is `manage` in the kernel's policy, so a `manage` seat draws this panel in full and a
 * `view` or `write` seat draws none of it — `createEpic` is what decides that, exactly as on the admin
 * surface. `createFeature` is a **`write`** grant, so the `Add feature` box on each row is the one control
 * here a `write` seat could use — and it never sees the panel to reach it, because a rail it cannot create
 * is a rail it cannot be shown a list of. That is a real consequence of opening the panel on one action and
 * it is recorded rather than worked around: a per-row control whose panel is gated higher than itself wants
 * a surface of its own, not a looser gate on this one.
 *
 * The controls are the seat's own, from `planCapabilities`, and not `ADMIN_CONTROLS`. That is the whole
 * difference between this function and its admin twin, and it is why they are two functions rather than one
 * taking a controls argument: a page that could be handed either set is a page that could be handed the
 * wrong one.
 */
export function seatRailsSlot(plan: PlanScreenModel, writes: PlanEditActions, controls: PlanControls) {
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

/**
 * The groups panel as a seat builds it, or `null` where this seat may not make a group.
 *
 * The twin of `groupsSlot`, and the same three-way split: `label:create` decides whether the editing half
 * is drawn at all, and the three answers that vary within it cross as flat booleans.
 *
 * The **chips** are not here and never were on either surface. They are mounted by `PlanHeading` from
 * `plan.labels`, because selecting a group writes nothing and so needs no credential — which is the
 * correction `components/plan/plan-heading.tsx` records, made after the chips were briefly inside this
 * panel and the whole feature became admin-only by accident. So a `view` seat selects groups and edits
 * none, which is exactly right and is what this function must not undo.
 */
export function seatGroupsSlot(plan: PlanScreenModel, writes: PlanEditActions, controls: PlanControls) {
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
