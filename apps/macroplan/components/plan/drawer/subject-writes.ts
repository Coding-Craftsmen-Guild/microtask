import type { PlanContentControls } from '../../../lib/plan-capabilities'
import type { PlanEditActions } from '../edit-actions'
import type { SubjectRemove, SubjectWrite } from './field'
import type { SubjectKind } from './values'

/** The two writes every subject has, each with the boolean that decides whether its field is drawn. */
export interface SubjectPair {
  /** Whether this surface draws the name field at all. Never a gate. */
  readonly renamable: boolean

  /** This kind's rename: `renameFeature` or `renameItem`, never both. */
  readonly rename: SubjectWrite<string>

  /** Whether this surface draws the estimate field at all. Never a gate. */
  readonly estimable: boolean

  /** This kind's re-estimate, which also carries the clear. */
  readonly estimate: SubjectWrite<number | null>
}

/**
 * Which of the eighteen writes a subject of this kind is edited by, and which of them are drawn.
 *
 * The **kind** chooses, rather than the caller: `renameFeature` and `renameItem` take a `planId` and a
 * subject id of types the compiler cannot tell apart, so a component handed the wrong one of the pair
 * would send a feature id to the item route and be answered 404 at best. One lookup by kind here means
 * no group below it can reach a second action, and a group drawn for a feature cannot be wired to an
 * item's write.
 *
 * It is not a client module and must not become one: it names `PlanEditActions` and
 * `PlanContentControls`, which are the whole actions object and the whole control set. What crosses
 * into the browser is one member of each, handed down as a `SubjectWrite` and a `boolean` (ADR 0040).
 *
 * @param kind - Which of the two the drawer is open on.
 * @param controls - What this surface draws, which is a rendering answer and never a gate.
 * @param actions - Every write of plan content, of which this picks two.
 * @returns The two writes and the two booleans, paired so neither can be taken from the other kind.
 */
export const pairFor = (
  kind: SubjectKind,
  controls: PlanContentControls,
  actions: PlanEditActions,
): SubjectPair =>
  kind === 'feature'
    ? {
        renamable: controls.renameFeature,
        rename: actions.renameFeature,
        estimable: controls.estimateFeature,
        estimate: actions.estimateFeature,
      }
    : {
        renamable: controls.renameItem,
        rename: actions.renameItem,
        estimable: controls.estimateItem,
        estimate: actions.estimateItem,
      }

/** The delete every subject has, with the boolean that decides whether its control is drawn. */
export interface SubjectRemoval {
  /** Whether this surface draws the delete at all. Never a gate. */
  readonly deletable: boolean

  /** This kind's delete: `removeFeature` or `removeItem`, never both. */
  readonly remove: SubjectRemove
}

/**
 * Which of the eighteen writes deletes a subject of this kind, and whether its control is drawn.
 *
 * {@link pairFor}'s argument, for the one write where getting it wrong is unrecoverable: `removeFeature`
 * and `removeItem` take a `planId` and a subject id of types the compiler cannot tell apart, so a control
 * handed the wrong one of the pair would send a feature id to the item route. The kind chooses here, once
 * per group, and never a caller.
 *
 * A **separate** lookup from {@link pairFor} rather than two more members on it, because the two answer
 * for two capability tiers: `feature:rename` and `feature:estimate` are `write` where `feature:delete`
 * and `item:delete` are `manage`-only (`packages/kernel/src/access/policy.ts`), and the pair is read by
 * the `write` band while this is read by the `manage` one (`./drawer-edits.tsx`, `./drawer-manage.tsx`).
 * One shape carrying both would hand each band a member it must not draw.
 *
 * @param kind - Which of the two the drawer is open on.
 * @param controls - What this surface draws, which is a rendering answer and never a gate.
 * @param actions - Every write of plan content, of which this picks one.
 * @returns The delete and the boolean, paired so neither can be taken from the other kind.
 */
export const removalFor = (
  kind: SubjectKind,
  controls: PlanContentControls,
  actions: PlanEditActions,
): SubjectRemoval =>
  kind === 'feature'
    ? { deletable: controls.removeFeature, remove: actions.removeFeature }
    : { deletable: controls.removeItem, remove: actions.removeItem }
