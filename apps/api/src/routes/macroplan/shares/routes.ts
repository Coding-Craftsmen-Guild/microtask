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
 * served: that record is computed in the browser, which is the whole reason ADR 0038 admits it, and
 * a served copy would be a second answer free to disagree with the one the client already has.
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
