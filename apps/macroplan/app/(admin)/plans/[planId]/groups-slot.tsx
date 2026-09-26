import { createLabel, recolourLabel, removeLabel, renameLabel } from '../../../../actions/labels'
import { LabelsPanel } from '../../../../components/plan/labels/labels-panel'
import { labelRows } from '../../../../components/plan/labels/label-rows'
import type { PlanScreenModel } from '../../../../components/plan/plan-screen-model'
import { ADMIN_CONTROLS } from '../../../../lib/admin-controls'

/**
 * The groups panel as the admin surface builds it, or `null` where this reader may not make one.
 *
 * A module of its own rather than a block in `layout.tsx`, because that file had five of its eighty lines
 * left (ADR 0027) and its own TSDoc had already named the slot wiring as the next thing to give way. It is
 * a **function returning an element** and not a component, which is the distinction that matters here: the
 * element is a slot's contents, decided by the page that holds the credential, and a component would invite
 * somebody to mount it from under `components/` where no action may be imported.
 *
 * `createLabel` is what decides whether the panel is drawn at all — a panel drawn for a reader who may not
 * make a group is a form that always 403s — and `removeLabel` crosses into it as a flat boolean, which is
 * the shape `module-boundaries.test.tsx` requires of anything reaching a client component. The two rename
 * halves need no answer of their own: they are the same `label:rename` authority, so a reader who may open
 * this panel at all may use both.
 *
 * Every action is a **module function imported by name**, so nothing here is a `bound ` closure carrying a
 * credential — the one smuggling mechanism ADR 0040 names, and what `layout.test.tsx`'s sweep looks for.
 */
export function groupsSlot(plan: PlanScreenModel) {
  if (!ADMIN_CONTROLS.content.createLabel) return null
  return (
    <LabelsPanel
      create={createLabel}
      mayRemove={ADMIN_CONTROLS.content.removeLabel}
      planId={plan.id}
      recolour={recolourLabel}
      remove={removeLabel}
      rename={renameLabel}
      rows={labelRows(plan)}
    />
  )
}
