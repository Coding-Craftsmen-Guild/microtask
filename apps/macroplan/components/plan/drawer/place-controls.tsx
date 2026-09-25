import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { TableRow } from '../table/rows'
import { LABEL } from './field'
import { PlaceControl } from './place-control'
import { placementFor, stepsFor } from './placement'
import type { DrawerValues, SubjectKind } from './values'

const GROUP = 'grid gap-1 border-0 p-0'

const LEGEND: Readonly<Record<SubjectKind, string>> = {
  feature: 'Move on its rail',
  item: 'Move in its feature',
}

/** Props for {@link PlaceControls}. */
export interface PlaceControlsProps {
  /** The plan every write below is addressed at. */
  readonly planId: string

  /** The subject: its `kind` chooses the write, the legend and which parent is its own. */
  readonly row: TableRow

  /** The same subject's values, resolved out of the same plan (`./subject.ts`). */
  readonly values: DrawerValues

  /** Which of these controls this surface draws. Never a gate (`lib/plan-capabilities.ts`). */
  readonly controls: PlanContentControls

  /** Every write of plan content, of which this hands two to the browser. */
  readonly actions: PlanEditActions
}

/**
 * Where this subject sits among its siblings, as one control per place it could be sent.
 *
 * ### The same action a drag sends, reached from a keyboard
 *
 * Spec §6: dragging "reorders an item within its feature or a feature within its rail, moves a feature to
 * another rail". Every one of those is `place(planId, subjectId, {parent, position})`, and this is that write
 * with the parent and the position worked out from the stored order instead of from a pointer. The canvas's
 * drag is the same action reached the other way (`../canvas/drag-root.tsx`), and this is the half that a
 * reader has and that the tests drive — `happy-dom` cannot perform a drag, and ADR 0056 records that a
 * role-based assertion is the whole a11y mechanism in this repository.
 *
 * `./placement.ts` decides what the steps are, so the two ways in cannot disagree about what one step is —
 * which is the rule Microtask's `moved` states for its own three reorder routes.
 *
 * ### A `<fieldset>`, because the buttons are one question about one subject
 *
 * The `<legend>` names what the group does to the subject — "Move on its rail" — and each button carries its
 * own whole name in its text, so a reader tabbing onto one hears `Move to Platform` and not `button`. The
 * same shape as `./dependency-editor.tsx`, and for the same reason: a legend alone leaves the controls
 * unnamed, and names alone leave a reader landing on the third one with no idea what the group is.
 *
 * ### Nothing is drawn for a rail the plan does not hold
 *
 * A feature whose `epicId` names no epic has `values.place.railId === null` — `railsOf` gives it a rail of its
 * own and the table words it `Unclaimed rail`, while `assertEpic` would answer 404 for that id
 * (`./values.ts`) — so there is no parent to send and no group is drawn, exactly as `./create-controls.tsx`
 * draws no box for it. An item's parent is never `null`: the row is the existence check and an item whose
 * `featureId` names no feature has no row.
 *
 * ### How long this list gets, and the debt that is
 *
 * One control per other parent, which is at most 39 rails (`LIMITS.epicsPerPlan`) for a feature and 199
 * features for an item. That is the same unfiltered-list debt `./dependency-editor.tsx` records against itself
 * at the same cap, with the same answer: a local filter over the rows is what would fix the tabbing, it is a
 * control with its own label and its own state, and this is the file that records the debt rather than the
 * place to pay it in passing. A `<select>` was the obvious alternative and is not open: its options are a
 * list, and a list may not cross this boundary — the repo's own precedent for "move to somewhere" is a
 * control per destination (`apps/microtask/components/task-tree/task-menu.tsx`).
 */
export function PlaceControls({ planId, row, values, controls, actions }: PlaceControlsProps) {
  const placement = placementFor(row.kind, controls, actions)
  const parentId = row.kind === 'feature' ? values.place.railId : values.place.featureId
  if (!placement.placeable || parentId === null) return null
  return (
    <fieldset className={GROUP}>
      <legend className={LABEL}>{LEGEND[row.kind]}</legend>
      {stepsFor(values.place.siblingIds, row.id, parentId, values.place.targets).map((step) => (
        <PlaceControl
          disabled={step.disabled}
          key={step.key}
          kind={row.kind}
          label={step.label}
          parentId={step.parentId}
          placeFeature={placement.placeFeature}
          placeItem={placement.placeItem}
          planId={planId}
          position={step.position}
          subjectId={row.id}
        />
      ))}
    </fieldset>
  )
}
