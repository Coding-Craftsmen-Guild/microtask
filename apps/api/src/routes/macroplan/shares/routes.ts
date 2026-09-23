import { createRoute } from '@hono/zod-openapi'
import { PlanShareView } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'

/**
 * What the seat that asked holds: the bootstrap call a plan holder makes before drawing anything.
 *
 * **It takes no parameter of any kind.** No token in the path, no token in a header schema — the
 * answer is derived from the principal the guard already resolved. A credential in a URL leaks into
 * server logs, proxy logs and the `Referer` of every link the page then renders, and a header schema
 * cannot express "the bearer you already sent" without declaring the credential twice (ADR 0013).
 *
 * It answers role, scope and the plan the scope names, which are what a client feeds
 * `capabilities()` from `@repo/contracts` to decide what to draw. The projection itself is not
 * served, and **not** because serving it would contradict ADR 0038 — read its *Alternatives
 * considered* and the opposite is true: returning the set with the bootstrap response, computed by
 * calling `can()`, is the option that ADR calls "genuinely the cleanest", precisely because the API
 * *can* import the kernel and there would then be exactly one implementation. It was rejected on
 * **reach**: the set is needed to render Server Components that make no bootstrap call, so serving it
 * here makes the capability set a prop threaded through the whole tree rather than a thing each
 * component derives where it stands.
 *
 * So the reason this route does not carry it is narrow and current: nothing in this API serves that
 * record today, and this route mirrors Microtask's handler, which is not the place to diverge from it.
 * ADR 0038 leaves its own door open — "worth revisiting if `shares/current` becomes a hard dependency
 * of every page anyway" — and phase 2 or 3 may well make that true, at which point the change belongs
 * to both products at once and to an amendment there rather than to a decision taken here.
 *
 * An admin credential names no seat, so this answers 404 for one. That is the honest reading and the
 * one Microtask's route already gives: an admin is not refused the question, there is simply no
 * current seat to describe, and a 403 would claim an authority problem that does not exist.
 */
export const currentPlanShareRoute = createRoute({
  method: 'get',
  path: '/shares/current',
  tags: ['shares'],
  summary: 'Describe the plan seat the caller presented',
  security: GUARDED_SECURITY,
  responses: {
    200: {
      description: 'The role, scope and plan of the credential that asked',
      content: { 'application/json': { schema: PlanShareView } },
    },
    ...problemResponses(),
  },
})
