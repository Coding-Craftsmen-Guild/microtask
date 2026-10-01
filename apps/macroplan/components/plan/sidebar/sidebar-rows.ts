import { railsOf } from '@repo/schedule'
import { detailsOf } from '../canvas/detail-lines'
import type { PlanScreenModel } from '../plan-screen-model'

/** One feature as the sidebar lists it: enough to name it, link to it and filter it. */
export interface SidebarFeature {
  /** The feature's id, which is its drawer's address and its selection radio's. */
  readonly id: string

  /** Its name, or the placeholder for one saved blank. */
  readonly name: string

  /**
   * What a hover over this row says, joined, which is the card its bar on the canvas shows.
   *
   * It is carried on the row rather than looked up when a pointer arrives, because the thing that
   * looks it up is a client component and may not be handed a plan. A rail has no such field: the
   * names column beside the canvas already says everything a one-line card about a rail could.
   */
  readonly detail: string
}

/** One rail and the features on it, in the order the timeline draws them. */
export interface SidebarRail {
  /** The epic's id, which keys its rail on the canvas and addresses its drawer. */
  readonly id: string

  readonly name: string

  /** The rail's own `#rrggbb`, painted as a swatch and never as a row background. */
  readonly colour: string

  /** Its features in derived rail order. */
  readonly features: readonly SidebarFeature[]
}

/** What an unnamed rail or feature reads as, rather than an empty row nobody can click. */
export const UNNAMED = '(unnamed)'

/**
 * The plan as a rail tree: every rail, and every feature on it in the order the canvas places them.
 *
 * ### Order comes from `railsOf`, and is not derived again here
 *
 * `railLayout` in `@repo/canvas` says why at length: rails are ordered by `(railOrder, id)` and features
 * within a rail by `(position, id)`, and a second total order written elsewhere could disagree with the
 * first on any tie. That would be a sidebar whose third row is a different feature from the canvas's third
 * bar — silently, and only for a plan with two features at one position. Calling the same function the
 * canvas calls means there is one order and this makes no ordering decision at all.
 *
 * ### Every rail, including one no epic claims
 *
 * `railsOf` gives a feature whose `epicId` names no epic a rail of its own, ordered after every real one,
 * and the canvas draws it. So does this: a feature reachable on the canvas and absent from the sidebar
 * would be a feature nobody could open, which is the failure this whole sidebar exists to fix. Such a rail
 * has no name and no colour of its own, and takes {@link UNNAMED} and the muted swatch the same way an
 * unnamed real rail does.
 *
 * ### It lists rails with no features
 *
 * A rail with nothing on it is exactly the rail somebody needs to find, because a new rail is empty and
 * putting the first feature on it is the next thing to do. `railsOf` groups **features**, so a rail with
 * none is absent from its answer — which is why `plan.epics` is walked here and `railsOf` is consulted for
 * order and membership rather than for the list of rails.
 */
export function sidebarRails(plan: PlanScreenModel): readonly SidebarRail[] {
  const details = detailsOf(plan)
  const named = new Map(plan.epics.map((epic) => [epic.id, epic]))
  const derived = railsOf(plan)
  const grouped = new Map(
    derived.flatMap((rail) => {
      const first = rail[0]
      return first === undefined ? [] : [[first.epicId, rail] as const]
    }),
  )
  const claimed = [...named.keys()].sort(
    (left, right) => (named.get(left)?.railOrder ?? 0) - (named.get(right)?.railOrder ?? 0),
  )
  const unclaimed = [...grouped.keys()].filter((id) => !named.has(id))
  return [...claimed, ...unclaimed].map((id) => ({
    id,
    name: named.get(id)?.name ?? UNNAMED,
    colour: named.get(id)?.colour ?? '',
    features: (grouped.get(id) ?? []).map((feature) => ({
      id: feature.id,
      name: plan.features.find((one) => one.id === feature.id)?.name ?? UNNAMED,
      detail: details.get(feature.id) ?? '',
    })),
  }))
}
