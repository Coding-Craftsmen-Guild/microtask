import { createEpic, recolourEpic, removeEpic, renameEpic, reorderEpic } from '../../../../actions/epics'
import { createFeature } from '../../../../actions/features'
import { createLabel, recolourLabel, removeLabel, renameLabel } from '../../../../actions/labels'
import { deletePlan, renamePlan, retimePlan } from '../../../../actions/plans'
import { LabelsPanel } from '../../../../components/plan/labels/labels-panel'
import { labelRows } from '../../../../components/plan/labels/label-rows'
import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'
import { railRows } from '../../../../components/plan/rails/rail-rows'
import { RailsPanel } from '../../../../components/plan/rails/rails-panel'
import { SettingsPanel } from '../../../../components/plan/settings/settings-panel'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'

/**
 * The rails panel as the admin surface builds it, or `null` where this reader may not make a rail.
 *
 * **The slot that makes a plan usable**, and the one whose absence made every other write unreachable: a
 * feature names the rail it sits on, so a plan with no rails admitted nothing, and the drawer that creates
 * a feature opens only on a subject that already exists. `components/plan/rails/rails-panel.tsx` holds the
 * whole account.
 *
 * `createEpic` decides whether the panel is drawn — a panel drawn for a reader who may not make a rail is a
 * form that always 403s — and the three answers that vary within it cross as flat booleans, the shape
 * `module-boundaries.test.tsx` admits. `reorderEpic` and `removeEpic` are their own actions rather than
 * `epic:rename` and so get their own answers; `createFeature` is a **`write`** grant where the rail actions
 * are all `manage`, which is the one place the two tiers meet on one row — a reader may be able to add a
 * feature to a rail it may not rename, and the row draws each half on its own answer.
 *
 * Renaming and recolouring get answers of their own, and that is a correction rather than thoroughness:
 * this panel is opened on `epic:create`, which is a **different** action from `epic:rename`, so a reader who
 * may add a rail and not rename one is a real principal and the row must not hand them a live name field.
 * Without the answer the name was editable for anybody who could see the panel — and the two controls went
 * unread, which is what `lib/plan-capabilities.ts` calls decoration. A reader refused them sees the name as
 * text and the hue as a dot.
 */
export function railsSlot(plan: PlanScreenModel) {
  if (!ADMIN_CONTROLS.content.createEpic) return null
  return (
    <RailsPanel
      create={createEpic}
      createFeature={createFeature}
      mayAddFeature={ADMIN_CONTROLS.content.createFeature}
      mayRecolour={ADMIN_CONTROLS.content.recolourEpic}
      mayRemove={ADMIN_CONTROLS.content.removeEpic}
      mayRename={ADMIN_CONTROLS.content.renameEpic}
      mayReorder={ADMIN_CONTROLS.content.reorderEpic}
      planId={plan.id}
      recolour={recolourEpic}
      remove={removeEpic}
      rename={renameEpic}
      reorder={reorderEpic}
      rows={railRows(plan)}
    />
  )
}
/**
 * The groups panel as the admin surface builds it, or `null` where this reader may not make one.
 *
 * A sibling of {@link railsSlot} in this module rather than a block in `layout.tsx`, because that file had
 * five of its eighty lines
 * left (ADR 0027) and its own TSDoc had already named the slot wiring as the next thing to give way. It is
 * a **function returning an element** and not a component, which is the distinction that matters here: the
 * element is a slot's contents, decided by the page that holds the credential, and a component would invite
 * somebody to mount it from under `components/` where no action may be imported.
 *
 * `createLabel` is what decides whether the panel is drawn at all — a panel drawn for a reader who may not
 * make a group is a form that always 403s — and the other three cross into it as flat booleans, which is the
 * shape `module-boundaries.test.tsx` requires of anything reaching a client component. `renameLabel` and
 * `recolourLabel` used to have no answer here, on the grounds that they are one authority a panel-opener
 * already holds. That was wrong twice over: the panel is opened on `label:create`, a **different** action, so
 * a reader who may make a group and not rename one is real; and two controls read by nothing are the
 * decoration `lib/plan-capabilities.ts` warns about. {@link railsSlot} above met the same thing, and both are
 * fixed together.
 *
 * Every action is a **module function imported by name**, so nothing here is a `bound ` closure carrying a
 * credential — the one smuggling mechanism ADR 0040 names, and what `layout.test.tsx`'s sweep looks for.
 */
export function groupsSlot(plan: PlanScreenModel) {
  if (!ADMIN_CONTROLS.content.createLabel) return null
  return (
    <LabelsPanel
      create={createLabel}
      mayRecolour={ADMIN_CONTROLS.content.recolourLabel}
      mayRemove={ADMIN_CONTROLS.content.removeLabel}
      mayRename={ADMIN_CONTROLS.content.renameLabel}
      planId={plan.id}
      recolour={recolourLabel}
      remove={removeLabel}
      rename={renameLabel}
      rows={labelRows(plan)}
    />
  )
}

/**
 * The settings panel as the admin surface builds it, or `null` where this reader may do none of the three.
 *
 * **The last of the four gaps that made a plan a one-way door.** A plan could be created and then never
 * renamed, never retimed and never deleted; `components/plan/settings/settings-panel.tsx` holds that
 * account and `PlanOwnControls` holds the argument for why these three are a group of their own rather than
 * three more content controls.
 *
 * It mounts on **any one of the three** rather than on a single opener, which is the difference from the
 * three slots above it: those are each built around one collection, so `epic:create` and `label:create` are
 * the question "may this reader make one of these at all". There is no such question here — a plan already
 * exists — so the panel is drawn whenever there is any section to put in it, and it answers `null` itself
 * when all three are refused. Both halves are needed: this decides whether a page mounts it, and the panel
 * decides whether an opened disclosure has anything inside.
 *
 * All three are `manage` in the kernel, so an admin holds them and a plan-scoped `manage` seat would too —
 * which is why the three booleans cross as flat props rather than being assumed from the mount. A seat
 * surface mounting this later needs no change here.
 */
export function settingsSlot(plan: PlanScreenModel) {
  const { plan: own } = ADMIN_CONTROLS
  if (!own.rename && !own.retime && !own.remove) return null
  return (
    <SettingsPanel
      mayRemove={own.remove}
      mayRename={own.rename}
      mayRetime={own.retime}
      plan={plan}
      remove={deletePlan}
      rename={renamePlan}
      retime={retimePlan}
    />
  )
}
