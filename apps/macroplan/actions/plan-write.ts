import type { MacroplanSessionClient, Plan } from '@repo/api-client'
import { refresh } from 'next/cache'
import { linkCall } from './link-call'
import { planPath } from '../lib/routes'
import { adminCall, type ActionResult } from './result'
import { planScreenModel, type PlanScreenModel } from '../components/plan/plan-screen-model'

const reduced = (result: ActionResult<Plan>): ActionResult<PlanScreenModel> =>
  result.ok ? { ok: true, value: planScreenModel(result.value) } : result

/**
 * Runs one structural write on a plan with the admin authority `mp_admin` names, and answers the plan it
 * produced — reduced to what a page may carry.
 *
 * The body every action in `epics.ts`, `features.ts`, `items.ts` and `labels.ts` shares. Written once
 * rather than once per action, because the rules in it are the kind that survive every copy but one.
 *
 * ### It does not re-render anything
 *
 * It used to `refresh()`: every write re-rendered the whole plan route on the server — the plan read again,
 * the bridge read again, the canvas and the table serialised again — and shipped all of it back in the
 * answer, which was most of the time an edit took. The plan screen holds the plan in the browser now and has
 * already drawn the change before this runs (ADR 0069); the answer is what it confirms that against, so
 * there is nothing to re-render. {@link adminBridgeWrite} is the one exception, and says why.
 *
 * ### The answer carries no share token
 *
 * The API answers an admin's write with every live seat on the plan, and this answer goes to the browser.
 * It used to be handed over as it came, which put every token on the plan into the response of every edit;
 * it is reduced with {@link planScreenModel} here, the same reduction the page itself makes (ADR 0033).
 *
 * `pathname` is built from the plan id the caller passed — a route fact — and never read from a header:
 * `adminCall` spends it on `?next=` when the session has expired, and an action is a public endpoint any
 * POST can reach. The id is a **target** for the API to judge, never proof the caller may touch it.
 *
 * None of these four is exported from a `'use server'` module, and that is deliberate: Next registers
 * **every** export of one as a Server Action reachable by its own id, and each takes a function argument no
 * browser could ever send.
 */
export async function adminWrite(
  planId: string,
  call: (api: MacroplanSessionClient) => Promise<Plan>,
): Promise<ActionResult<PlanScreenModel>> {
  return reduced(await adminCall(planPath(planId), call))
}

/**
 * {@link adminWrite} for the writes that reach the other product — bind, unbind, link, unlink, create a
 * task — which still re-render the page they changed, once the write has succeeded.
 *
 * What these do is not in the plan the browser holds: a rail's binding state and a linked item's task name
 * and count come from the bridge, which only the server can read (ADR 0061). So the route is re-rendered
 * with a fresh bridge read, and `PlanApp` adopts the plan that render carries. They are rare, and each one is
 * a decision about another product, so one round trip for them is the right price.
 */
export async function adminBridgeWrite(
  planId: string,
  call: (api: MacroplanSessionClient) => Promise<Plan>,
): Promise<ActionResult<PlanScreenModel>> {
  const result = await adminWrite(planId, call)
  if (result.ok) refresh()
  return result
}

/**
 * Runs one structural write on a plan with the authority of the share token handed in, and answers the plan
 * it produced, reduced — {@link adminWrite} with the one word changed, which call runs it.
 *
 * It runs through `linkCall`, which takes no pathname: a seat has nothing to be sent back to, because its
 * credential was in the URL it is being redirected away from (`lib/routes.ts`, ADR 0040). The token is the
 * whole credential, re-presented to the API and checked there on every call; which writes the holder may
 * actually perform is the API's own answer, from the seat's own role.
 */
export async function seatWrite(
  token: string,
  call: (api: MacroplanSessionClient) => Promise<Plan>,
): Promise<ActionResult<PlanScreenModel>> {
  return reduced(await linkCall(token, call))
}

/** {@link seatWrite} for a seat's bridge writes, re-rendering for the reason {@link adminBridgeWrite} gives. */
export async function seatBridgeWrite(
  token: string,
  call: (api: MacroplanSessionClient) => Promise<Plan>,
): Promise<ActionResult<PlanScreenModel>> {
  const result = await seatWrite(token, call)
  if (result.ok) refresh()
  return result
}
