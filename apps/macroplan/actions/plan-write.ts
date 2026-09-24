import type { MacroplanSessionClient, Plan } from '@repo/api-client'
import { refresh } from 'next/cache'
import { planPath } from '../lib/routes'
import { adminCall, type ActionResult } from './result'

/**
 * Runs one structural write on a plan with the admin authority `mp_admin` names, and re-renders the
 * page it changed.
 *
 * The body every action in `epics.ts`, `features.ts` and `items.ts` shares. Written once rather than
 * once per action, because the two rules in it are the kind that survive every copy but one, where
 * nothing but a reader would notice.
 *
 * `refresh` runs **only when the write succeeded**. A refused write changed nothing, so there is
 * nothing to re-render, and re-rendering would replace the sentence the caller is about to show with
 * the page it already had. It is `refresh` and not `revalidatePath` or `revalidateTag`: neither of
 * those is called anywhere in this repository — here and in `apps/microtask/actions/`, `refresh` is
 * the whole of revalidation — and every write here already answers the plan the page renders, so
 * there is no second path for a caller to name.
 *
 * `pathname` is built here from the plan id the caller passed — a route fact — and never read from a
 * header. It is not for this request: `adminCall` spends it on `?next=` when the session has expired,
 * so a header-derived one would be a redirect target chosen by whoever sent the POST, and an action
 * is a public endpoint any POST can reach.
 *
 * It takes the id and the call rather than the built pathname, so no caller can pass a path that is
 * not a plan page. The id is a **target** for the API to judge, never proof the caller may touch it:
 * `adminCall` re-derives the authority from the cookie on every call and this adds nothing to it.
 */
export async function adminWrite(
  planId: string,
  call: (api: MacroplanSessionClient) => Promise<Plan>,
): Promise<ActionResult<Plan>> {
  const result = await adminCall(planPath(planId), call)
  if (result.ok) refresh()
  return result
}
