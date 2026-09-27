import { railsOf } from '@repo/schedule'
import type { PlanScreenModel } from '../plan-screen-model'
import type { TrayRow } from './unscheduled-tray'

/**
 * The features with no bar, in the order the board would have drawn them.
 *
 * ### Why it reads `railsOf` and not `schedule.unscheduled`
 *
 * `unscheduled` holds features and items together and is in the pass's own discovery order, which is
 * neither the plan's nor the board's. Walking the rails instead gives rows in the order a reader
 * just saw on screen — rail by rail, and within a rail in position order — so the tray reads as a
 * continuation of the board rather than as a separate report about it.
 *
 * It also answers the items question by construction: `railsOf` walks features, so an item cannot
 * appear here however the pass reported it.
 *
 * ### What counts as unplaced
 *
 * Having no span. Not "has no estimate": a feature caught in a dependency cycle has an estimate and
 * still has nowhere to go, and `spans` is the one place that distinction is already settled.
 */
export function trayRows(plan: PlanScreenModel): readonly TrayRow[] {
  const placed = new Set(plan.schedule.spans.map((span) => span.id))
  const names = new Map(plan.features.map((feature) => [feature.id, feature.name]))
  const rails = new Map(plan.epics.map((epic) => [epic.id, epic.name]))
  return railsOf(plan).flatMap((rail) =>
    rail.flatMap((feature) =>
      placed.has(feature.id)
        ? []
        : [
            {
              id: feature.id,
              name: names.get(feature.id) ?? feature.id,
              railName: rails.get(feature.epicId) ?? null,
            },
          ],
    ),
  )
}
