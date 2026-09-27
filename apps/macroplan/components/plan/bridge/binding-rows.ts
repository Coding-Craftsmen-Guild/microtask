import type { PlanBridge } from '@repo/api-client'
import type { PlanScreenModel } from '../plan-screen-model'
/**
 * One rail as the bridge reports it: its name, and what it is bound to right now.
 *
 * Declared here, where it is built, rather than in whatever renders it. It was the bindings panel's type
 * while that panel was the only reader; the panel is gone (design §2) and the rows are not, because the
 * rail drawer needs exactly this answer for one rail.
 */
export interface BindingRow {
  /** The rail. */
  readonly epicId: string

  /** The rail's own name, so an admin binds the one they meant. */
  readonly name: string

  /** The bound project, or `null` for a rail bound to nothing or whose token no longer resolves. */
  readonly projectId: string | null

  /** What the binding is worth **today** — already attenuated — or `null` when it is not live. */
  readonly role: string | null

  /** Whether a binding is **stored**, which is not the same as its being live. */
  readonly stored: boolean
}

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

/** What a rail's state reads as, so no two surfaces word the same state differently. */
export const BINDING_WORDS = {
  unbound: 'not bound to a Microtask project',
  dead: 'bound, but its token no longer works — rebind it',
} as const

/**
 * One rail's binding as a sentence: bound and to what, bound but dead, or not bound.
 *
 * **Three states and not two.** A rail can be bound to nothing, bound and live, or bound with a token
 * that no longer resolves — revoked in Microtask, or its project deleted. Design §7.2 requires the last to
 * render as "unlinked" rather than as an error everywhere else in the product, and the bridge answers it
 * that way; the rail drawer is the one surface whose reader can *fix* it, so it says so in its own words
 * rather than making a revoked rail indistinguishable from one nobody ever bound.
 *
 * That is not a leak. Which project a rail stores is already on the plan read's admin-only block, and the
 * only surface that draws this is drawn for the same principal.
 */
export function bindingStateOf(row: BindingRow): string {
  if (row.projectId !== null) return `bound to ${row.projectId} at ${row.role ?? 'view'}`
  return row.stored ? BINDING_WORDS.dead : BINDING_WORDS.unbound
}
