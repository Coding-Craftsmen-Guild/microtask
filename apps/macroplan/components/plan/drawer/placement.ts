import type { FeaturePlacement, ItemPlacement } from '@repo/api-client'
import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { SubjectWrite } from './field'
import type { PlaceTarget, SubjectKind } from './values'

/** The two place writes, with the boolean that decides whether this subject's controls are drawn. */
export interface SubjectPlacement {
  /** Whether this surface draws the place controls at all. Never a gate. */
  readonly placeable: boolean

  /** Moves one feature along its rail or onto another. */
  readonly placeFeature: SubjectWrite<FeaturePlacement>

  /** Moves one item inside its feature or under another. */
  readonly placeItem: SubjectWrite<ItemPlacement>
}

/**
 * Which of the eighteen writes places a subject of this kind, and whether its controls are drawn.
 *
 * `feature:place` and `item:place` are both `manage` actions (`packages/kernel/src/access/policy.ts`), so
 * this is read by the `manage` band and by nothing else — the same tier line `removalFor` is split along
 * in `./subject-writes.ts`.
 *
 * **Both** writes come back, where `pairFor` and `removalFor` each answer with one. That is not a lapse in
 * the rule those two state, it is the one case it cannot cover: the payloads differ —
 * `FeaturePlacementPayload` names an `epicId` and `ItemPlacementPayload` a `featureId`
 * (`packages/contracts/src/structure-payloads.ts`) — so there is no single `SubjectWrite<Value>` both fit,
 * and a server-side wrapper that made them one shape could not cross a client boundary at all, an
 * arbitrary closure being unserialisable where an action reference is not (ADR 0040).
 * `./create-controls.tsx` is handed two actions for exactly that reason and argues it at length, and this
 * is the second instance of it. The `kind` picks in the browser, beside the payload it builds.
 *
 * What that costs against `removalFor`'s guarantee is bounded and worth saying: a control wired to the
 * wrong one of the two sends a feature id to the item route and is answered 404, where the mistake
 * `removalFor` exists to prevent deletes the wrong record and cannot be taken back.
 *
 * @param kind - Which of the two the drawer is open on.
 * @param controls - What this surface draws, which is a rendering answer and never a gate.
 * @param actions - Every write of plan content, of which this picks two.
 * @returns The two writes and the one boolean that belongs to this kind.
 */
export const placementFor = (
  kind: SubjectKind,
  controls: PlanContentControls,
  actions: PlanEditActions,
): SubjectPlacement => ({
  placeable: kind === 'feature' ? controls.placeFeature : controls.placeItem,
  placeFeature: actions.placeFeature,
  placeItem: actions.placeItem,
})

/**
 * One place a subject can be sent, as the primitives one client control is handed.
 *
 * Every member is a primitive, which is what makes a row of these crossable: a client component may be
 * handed primitives, an unbound function or `null` and nothing else (`../module-boundaries.test.tsx`), so
 * the list stays on the server and one row's worth of values crosses per control — the shape
 * `./cycle-check.ts`'s `EdgeChoice` established.
 */
export interface PlaceStep {
  /** React's key, and nothing a user sees: `up`, `down`, or the target parent's own id. */
  readonly key: string

  /** The control's whole accessible name — `Move up`, or `Move to Platform`. */
  readonly label: string

  /** The parent this step sends: the subject's own, or another rail or feature. */
  readonly parentId: string

  /** The place among the siblings it would land at, once the subject is lifted out of them. */
  readonly position: number

  /** Whether there is nowhere to go, which is what an end of the list is drawn as. */
  readonly disabled: boolean
}

const stepTo = (siblingIds: readonly string[], id: string, delta: -1 | 1): number | null => {
  const from = siblingIds.indexOf(id)
  const to = from + delta
  return from < 0 || to < 0 || to >= siblingIds.length ? null : to
}

/**
 * Every place one subject can be sent from a keyboard: one step each way, and one per other parent.
 *
 * ### Why a keyboard has these at all
 *
 * A reorder that exists only under a pointer is a reorder a keyboard user does not have, and `happy-dom`
 * cannot drive a real drag either — so this is both the accessible path and the tested one, and the canvas's
 * drag is the same `place` action reached another way (`../canvas/drag-root.tsx`). It is Microtask's answer
 * to the same problem, from the same shared helper down to the two labels:
 * `apps/microtask/components/task-tree/task-menu.tsx` draws `Move up` and `Move down` disabled at the ends
 * and a `Move to …` per other folder, "computed by a shared pure helper so the tree and the strip cannot
 * disagree about what a step is".
 *
 * ### The number every step carries is an index in the list with the subject lifted out
 *
 * That is what the far end reads: `placeAmong` in `packages/macroplan-domain/src/services/positions.ts`
 * takes `position` as "where the moved entry lands among the siblings that are left once it is lifted out",
 * and clamps it. So one step down is `from + 1` and not `from + 2` — lifting the subject out has already
 * shifted everything after it back by one — and one step up is `from - 1`. It is also the number
 * `dropTargetFor` answers for the same move on the canvas, which is what keeps the two ways in from
 * meaning different things.
 *
 * The ends are **disabled rather than absent**, which is what Microtask draws and what a keyboard needs: a
 * control that disappears at the end of a list moves the next control under the user's fingers. A disabled
 * step still carries a position, because there is no position to carry that means "nowhere" — it carries
 * the subject's own, so the value is the one that would change nothing if the attribute were ever dropped.
 *
 * ### A move to another parent keeps the place it has
 *
 * Spec §6 has a drag "move a feature to another rail", and this is that same write with a different
 * `epicId`. The position sent is the subject's own, so a feature moved between rails keeps the place it had
 * in the list it lands in — clamped by `placeAmong` where the new rail is shorter, which is why no count of
 * the target's siblings has to cross. §6's "append after the last sibling" is about **new** work and is
 * deliberately not what a move does.
 *
 * @param siblingIds - Every sibling under this subject's own parent, in stored order, this subject included.
 * @param id - The subject being moved.
 * @param parentId - Its own parent, which both steps keep.
 * @param targets - The other parents it could be sent to, already named (`./values.ts`).
 * @returns One step per control to draw, in reading order, or none for a subject the list does not hold.
 */
export function stepsFor(
  siblingIds: readonly string[],
  id: string,
  parentId: string,
  targets: readonly PlaceTarget[],
): readonly PlaceStep[] {
  const here = siblingIds.indexOf(id)
  if (here === -1) return []
  const up = stepTo(siblingIds, id, -1)
  const down = stepTo(siblingIds, id, 1)
  return [
    { key: 'up', label: 'Move up', parentId, position: up ?? here, disabled: up === null },
    { key: 'down', label: 'Move down', parentId, position: down ?? here, disabled: down === null },
    ...targets.map((target) => ({
      key: target.id,
      label: `Move to ${target.name}`,
      parentId: target.id,
      position: here,
      disabled: false,
    })),
  ]
}
