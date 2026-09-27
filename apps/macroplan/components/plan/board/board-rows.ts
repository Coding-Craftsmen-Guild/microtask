import type { RailBox } from '@repo/canvas'
import type { PlanScreenModel } from '../plan-screen-model'

/** One rail as the names column draws it: what it is called, its colour, and how much is on it. */
export interface BoardRail {
  readonly id: string

  /** The rail's name, or `null` for a rail no epic claims. */
  readonly name: string | null

  readonly colour: string | null

  /** Every feature filed on the rail, placed or not — which is what the reader counts. */
  readonly featureCount: number
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
export function boardRails(plan: PlanScreenModel, rails: readonly RailBox[]): readonly BoardRail[] {
  const named = new Map(plan.epics.map((epic) => [epic.id, epic]))
  return rails.map((rail) => ({
    id: rail.epicId,
    name: named.get(rail.epicId)?.name ?? null,
    colour: rail.colour,
    featureCount: rail.featureIds.length,
  }))
}
