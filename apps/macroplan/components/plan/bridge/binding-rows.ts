import type { PlanBridge } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
import type { BindingRow } from './bindings-panel'

/**
 * One row per rail, in rail order, built from the two reads that each know half of the answer.
 *
 * The plan read knows what is **stored** — `epics[].binding`, an admin-only block carrying the project
 * and the declared role and never the token. The bridge read knows what is **live**: whether that token
 * still resolves, and what role it is worth today after attenuation. Neither is sufficient alone, and the
 * difference between them is the whole of the third state a rail can be in — bound, but with a token that
 * no longer works.
 *
 * A rail whose bridge row is missing entirely is treated as not live rather than as unknown. That happens
 * when the bridge request itself did not land (`read-bridge.ts` collapses every such failure to `null`),
 * and the honest reading is the conservative one: say the rail is stored-but-not-live, which is the state
 * whose own sentence tells an admin to rebind. Saying "bound and fine" on the strength of a read that
 * never happened would be the one wrong answer here.
 *
 * Sorted by `railOrder` rather than left in array order, so the panel reads top to bottom the way the
 * timeline does. A reader matching a row to a rail on screen is doing it by eye.
 */
export function bindingRows(plan: PlanScreenModel, bridge: PlanBridge | null): readonly BindingRow[] {
  const live = new Map((bridge?.epics ?? []).map((row) => [row.epicId, row]))
  return [...plan.epics]
    .sort((left, right) => left.railOrder - right.railOrder)
    .map((rail) => {
      const found = live.get(rail.id)
      const bound = found?.state === 'bound' ? found.binding : undefined
      return {
        epicId: rail.id,
        name: rail.name,
        projectId: bound?.projectId ?? null,
        role: bound?.role ?? null,
        stored: (rail.binding ?? null) !== null,
      }
    })
}
