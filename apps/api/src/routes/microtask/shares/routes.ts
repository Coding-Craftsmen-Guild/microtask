import { createRoute } from '@hono/zod-openapi'
import { ShareView } from '@repo/contracts'
import { problemResponses } from '../../../http/error-responses.js'
import { GUARDED_SECURITY } from '../../../http/security.js'

/**
 * What the credential that asked can reach: the bootstrap one route tree owes a link holder.
 *
 * **It takes no parameter of any kind.** No token in the path, no token in a header schema —
 * the answer is derived from the principal the guard already resolved. A credential in a URL
 * leaks into server logs, proxy logs and the `Referer` of every link the page then renders, and
 * a header schema cannot express "the bearer token you already sent" without declaring the
 * credential a second time (ADR 0013).
 *
 * An admin credential names no share link, so this answers 404 for one. That is the honest
 * reading: an admin is not refused the question, there is simply no current share to describe,
 * and answering 403 would claim an authority problem that does not exist.
 */
export const currentShareRoute = createRoute({
  method: 'get',
  path: '/shares/current',
  tags: ['shares'],
  summary: 'Describe the share link the caller presented',
  security: GUARDED_SECURITY,
  responses: {
    200: {
      description: 'The role, scope and reachable tree of the credential that asked',
      content: { 'application/json': { schema: ShareView } },
    },
    ...problemResponses(),
  },
})
