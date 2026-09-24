import type { MacroplanSessionClient, Plan } from '@repo/api-client'
import { refresh } from 'next/cache'
import { linkCall } from './link-call'
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

/**
 * Runs one structural write on a plan with the authority of the share token handed in, and
 * re-renders the page it changed.
 *
 * The body every action in `seat-writes.ts` shares, and it lives beside {@link adminWrite} rather
 * than in a module of its own because the two are the same two sentences with one word changed —
 * which call runs it. The rule underneath them is the one that would drift if a reader had to find
 * the other file to compare: a refused write changed nothing, so `refresh` runs **only on success**,
 * and re-rendering a refusal would replace the sentence the caller is about to show with the page it
 * already had. Both surfaces re-render for the same reason, too: `/s/<token>` reads its plan on the
 * server from the token in its own URL, exactly as `/plans/<planId>` reads it from `mp_admin`, so a
 * write that landed leaves a rendered plan that is one version behind on either of them.
 *
 * The `refresh` is here and not in `linkCall` for the reason `apps/microtask/actions/`'s link
 * actions each carry their own: `linkCall` is also the body of `linkRead`, which a **page** calls
 * while it renders, and a re-render asked for during a read is not a re-render of anything that
 * changed.
 *
 * **It takes no pathname**, where {@link adminWrite} builds one from the plan id. The only use the
 * admin half makes of that path is `?next=`, so an expired session lands back where it was; a seat
 * has nothing to be sent back to, because its credential was in the URL it is being redirected away
 * from, and a `?next=` on this surface could carry nothing *but* that credential — which is the leak
 * `proxy.ts` refuses to create when it declines to gate `/s/*`. `linkCall` fixes the path at
 * `LINK_UNAVAILABLE_PATH` for that reason, and a 401 here is a dead link rather than an expiry.
 *
 * The token is the whole credential and is re-presented to the API on every call, so this adds no
 * authority to it and takes none away: which of the eighteen writes the holder may actually perform
 * is the API's answer, from the seat's own role (`packages/kernel/src/access/policy.ts`).
 *
 * Neither this nor {@link adminWrite} is exported from a `'use server'` module, and that is
 * deliberate: Next registers **every** export of one as a Server Action reachable by its own id, and
 * both of these take a function argument no browser could ever send. They are ordinary functions the
 * action modules import, so the only public endpoints this app publishes are the actions themselves.
 */
export async function seatWrite(
  token: string,
  call: (api: MacroplanSessionClient) => Promise<Plan>,
): Promise<ActionResult<Plan>> {
  const result = await linkCall(token, call)
  if (result.ok) refresh()
  return result
}
