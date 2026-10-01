import type { RailBox } from '@repo/canvas'
import type { Attention, AttentionMap } from '../attention/attention'
import type { PlanScreenModel } from '../plan-screen-model'

/** One rail as the names column draws it: what it is called, its colour, and how much is on it. */
export interface BoardRail {
  readonly id: string

  /** The rail's name, or `null` for a rail no epic claims. */
  readonly name: string | null

  readonly colour: string | null

  /** Every feature filed on the rail, placed or not — which is what the reader counts. */
  readonly featureCount: number

  /**
   * What this row can be found by, lowered once on the server.
   *
   * Pre-lowered because the filter runs on every keystroke and `includes` on two already-lowered
   * strings is what keeps two hundred names from being lower-cased eight times a second
   * (`./board-filter.tsx`). A rail no epic claims has `''` and so matches only an empty needle, which
   * is the honest answer: it has no name to find it by.
   */
  readonly search: string

  /**
   * What is wrong on this rail, one entry per distinct kind.
   *
   * ### Why a rail carries this and a feature no longer does
   *
   * The dot was on a **feature's** row in the rail tree, which listed every feature under its rail.
   * There is no such row any more: the column beside the board is one row per rail, and a feature is
   * a mark on the canvas. So the signal is summarised to the lane it is on — a reader scanning the
   * column still sees which rails have something to look at, and the rail's own drawer and the tray
   * under the board are where each feature's own sentences are (`attention/attention-mark.tsx`).
   *
   * Deduplicated by kind, because a rail with four unsized features has one thing wrong with it four
   * times and a title listing `Needs an estimate` four times is a worse answer than listing it once.
   */
  readonly attention: readonly Attention[]
}

const KINDS_IN_ORDER: readonly string[] = ['no-estimate', 'in-cycle', 'edge-ignored']

const railAttention = (
  featureIds: readonly string[],
  found: AttentionMap,
): readonly Attention[] => {
  const byKind = new Map<string, Attention>()
  for (const featureId of featureIds) {
    for (const each of found.get(featureId) ?? []) if (!byKind.has(each.kind)) byKind.set(each.kind, each)
  }
  return KINDS_IN_ORDER.flatMap((kind) => {
    const found = byKind.get(kind)
    return found === undefined ? [] : [found]
  })
}

/**
 * The rails the board draws, in the order the canvas draws them.
 *
 * Built from `railLayout`'s own output rather than from the plan, so the names column cannot
 * disagree with the bands beside it about which rail is row three. That is the same reason
 * `arcLayout` takes the rails and does not re-derive them: two total orders over one set of
 * features is one more than a plan can have.
 *
 * `featureCount` is `featureIds`, not `bars`. A rail whose features are all unsized has no bars and
 * is still a rail with four features on it, and saying "0 features" there would be a lie told by the
 * geometry rather than by the plan.
 */
export function boardRails(
  plan: PlanScreenModel,
  rails: readonly RailBox[],
  found: AttentionMap,
): readonly BoardRail[] {
  const named = new Map(plan.epics.map((epic) => [epic.id, epic]))
  return rails.map((rail) => {
    const name = named.get(rail.epicId)?.name ?? null
    return {
      id: rail.epicId,
      name,
      colour: rail.colour,
      featureCount: rail.featureIds.length,
      search: (name ?? '').toLowerCase(),
      attention: railAttention(rail.featureIds, found),
    }
  })
}
