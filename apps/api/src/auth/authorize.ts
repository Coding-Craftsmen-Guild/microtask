import type { Context } from 'hono'
import { can, Forbidden, type Action, type Principal, type Target } from '@repo/kernel'
import type { ApiEnv } from './env.js'

/**
 * How every 403 this app raises is worded, built in one place.
 *
 * `requireProduct` refuses a request before any handler has built a target, so it has no `can()`
 * call of its own to word a refusal from — and it must still be indistinguishable from the gate’s,
 * because two spellings of the same 403 would tell a client which layer refused it. Exported so the
 * other refusal sites call this rather than transcribing the template, which is what
 * `routes/microtask/shares/handlers.ts` did while nothing tied its copy to this original.
 *
 * It names the action and never the target, for the reason {@link authorize} gives below.
 */
export const notPermitted = (action: Action): string => `Not permitted: ${action}`

/**
 * The one gate: the single place `apps/api` asks the policy whether a request may proceed.
 *
 * Throwing rather than returning a boolean is what makes forgetting it visible. A handler that
 * ignores a returned `false` still answers 200; a handler that never calls this at all is the
 * only remaining way to be unguarded, and that is a `grep` away — `grep -c 'authorize(' src/routes`
 * must equal the handler count.
 *
 * One **gate**, not one mention of `can()`. A gate is one check on the way in for a request with
 * a single target; a filter is a per-item predicate over a result set, and has to run where the
 * items are. So `SearchService` and the views call `can()` directly and legitimately (ADR 0009),
 * and routing their filtering through here would mean the API receiving the unfiltered set first,
 * which is the leak that ADR exists to prevent.
 *
 * The target is built by the caller from its **validated** params, so the path decides what is
 * being asked about. The refusal names the action and never the target: a 403 must confirm
 * nothing about whether the resource exists, which is also why the response is built from
 * scratch rather than from the context a handler may already have put an `etag` on.
 *
 * Returns the principal it just cleared, so a handler shaping a response per principal
 * (ADR 0013) has no second way to reach it.
 */
export function authorize(c: Context<ApiEnv>, action: Action, target: Target): Principal {
  const principal = c.get('principal')
  if (!can(principal, action, target)) throw new Forbidden(notPermitted(action))
  return principal
}
