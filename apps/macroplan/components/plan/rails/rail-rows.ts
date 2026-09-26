import type { PlanScreenModel } from '../plan-screen-model'

/** One rail as the editor reports it: what it is called, its hue, where it sits, and what is on it. */
export interface RailRow {
  /** The epic. */
  readonly id: string

  /** What it is called. */
  readonly name: string

  /** Its `#rrggbb`, which spec §5 gives it sole claim on: a rail owns hue. */
  readonly colour: string

  /** Where it sits among its siblings, 0-based and dense, as the plan stores it. */
  readonly railOrder: number

  /**
   * How many features are on it.
   *
   * The number a reader needs before deleting one, because **deleting a rail cascades**: its features
   * and their items go with it, which is the widest destructive write on this surface. A count is what
   * separates "remove this empty lane I made by mistake" from "remove nine features".
   */
  readonly features: number
}

const byRailOrder = (left: RailRow, right: RailRow): number => left.railOrder - right.railOrder

/**
 * Every rail of one plan, in the order the timeline draws them, each with what is on it.
 *
 * Sorted by `railOrder` rather than taken as stored, and that is the one thing here worth stating: the
 * domain renumbers rails densely on every move, so the array is *usually* already in order — but
 * `PlanManifest.epics` is a stored array and nothing in the contract promises its order, while
 * `railOrder` is the field that means it. An editor listing rails in a different order from the canvas
 * beside it would make reordering unreadable, since the control and its effect would disagree.
 *
 * The count is one pass over `features` per rail, which at this product's caps is forty times two
 * hundred — the same shape `labelRows` argues for the same reason.
 */
export function railRows(plan: PlanScreenModel): readonly RailRow[] {
  return plan.epics
    .map((epic) => ({
      id: epic.id,
      name: epic.name,
      colour: epic.colour,
      railOrder: epic.railOrder,
      features: plan.features.filter((feature) => feature.epicId === epic.id).length,
    }))
    .sort(byRailOrder)
}
