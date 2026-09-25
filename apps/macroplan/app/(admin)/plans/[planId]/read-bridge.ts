import type { PlanBridge } from '@repo/api-client'
import { cache } from 'react'
import { apiForSession } from '../../../../lib/api'

/** What the bridge answered, or nothing at all — this read never stops a plan from rendering. */
export type BridgeRead = PlanBridge | null

/**
 * What this plan's rails are bound to, and what each linked item's task counts — or `null`.
 *
 * ### Why this does not go through `adminRead`
 *
 * Every other read on this surface does, and it was written that way first and was wrong: `adminRead`
 * applies `missingIsNotFound`, so a 404 becomes `notFound()` and a 401 becomes a redirect. Either would
 * mean a failure of the **bridge** taking down the plan page — and design §7.2 requires the opposite in
 * as many words, that a dead binding renders as a stated state and "never an error page and never an
 * empty canvas". The same holds one level up: Microtask being unreachable, or this route answering
 * anything at all unexpected, must cost the progress column and the filled bars and nothing else.
 *
 * So it builds the client itself and collapses **every** failure to `null`. The plan read above it is
 * what decides whether there is a page, and it runs against the same cookie — so a caller with no
 * session has already been redirected by the time this answers, and a plan that does not exist has
 * already been a 404. There is no failure left for this one to have an opinion about.
 *
 * The `catch` is bare rather than an `unstable_rethrow`, which the action helpers use: nothing inside
 * `plans.readBridge` reaches a Next API, so there is no framework control-flow error to be swallowed —
 * the only things it throws are the transport's own.
 *
 * ### Why it is a second read
 *
 * A plan holding up to `LIMITS.epicsPerPlan` bindings would otherwise put forty Microtask manifest reads
 * on the path that draws the timeline (ADR 0061). `cache()` for the reason `readPlan` uses it: the layout
 * and its drawer child both need this within one render, and one request is what they should cost.
 *
 * ### What a `null` does not mean
 *
 * It does not mean a rail's token was revoked. The API answers **200** for that, with the rail reported
 * unlinked, because it is a fact about the plan rather than a failure. A `null` here means the request
 * did not land at all, and the two are deliberately indistinguishable downstream: both draw no counted
 * number, which is what §7.2 requires of anything that is not a counted number.
 *
 * The answer is already shaped for whoever asked — the epic block is absent for anybody but an admin, and
 * a task's name is absent on any rail this reader reaches at less than `write`. There is nothing here for
 * a surface to hide, which is what makes spec §9's gate a property of the API rather than of this app.
 */
export const readBridge = cache(async (planId: string): Promise<BridgeRead> => {
  const api = await apiForSession()
  if (api === null) return null
  try {
    return await api.plans.readBridge(planId)
  } catch {
    return null
  }
})
