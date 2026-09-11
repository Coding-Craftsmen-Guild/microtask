import { OpenAPIHono, createRoute } from '@hono/zod-openapi'
import { AdminSession, LoginPayload } from '@repo/contracts'
import type { ApiDeps } from '../deps.js'
import { problemResponsesFor } from '../http/error-responses.js'
import { SERVICE_ONLY_SECURITY } from '../http/security.js'
import { AdminVerifier } from './admin-verifier.js'
import type { ServiceEnv } from './env.js'
import { refuseLogin, requireService } from './require-service.js'

/**
 * Exchange the admin password for a short-lived bearer token (ADR 0012).
 *
 * It lives on `/v1` and **outside** the principal guard, because its whole purpose is to mint
 * the credential that guard demands; a login behind the guard is a login nobody can reach. It is
 * still guarded — by the service key alone — so the one unauthenticated write in this API still
 * names the app making it.
 *
 * Rate limiting is **not** here and is not an oversight: throttling belongs with the deployment
 * that can see every replica, and inventing a per-process counter would report a limit it cannot
 * enforce. Plan 5 owns it, and `reportLoginRefusal` is the signal it attaches to.
 */
export const loginRoute = createRoute({
  method: 'post',
  path: '/login',
  tags: ['auth'],
  summary: 'Exchange the admin password for a token',
  description:
    'Answers 401 for a wrong password and for an unrecognised service key, with the same document for both.',
  security: SERVICE_ONLY_SECURITY,
  request: {
    body: { required: true, content: { 'application/json': { schema: LoginPayload } } },
  },
  responses: {
    200: {
      description: 'A short-lived admin token and when it expires',
      content: { 'application/json': { schema: AdminSession } },
    },
    ...problemResponsesFor([401, 422, 500]),
  },
})

/**
 * Everything served under `/v1/auth`: the one route that turns a password into a principal.
 *
 * Its own child app rather than two lines on `createV1`, so the service-key guard can be `'*'`
 * over this subtree and nothing else. Registered first, then the route — the order every guard
 * in this tree is registered in, because one added afterwards never runs.
 *
 * Typed `OpenAPIHono<ServiceEnv>`: there is no principal here, and the type says so. A handler
 * under this mount cannot read `c.get('principal')` at all, which is what keeps `ApiEnv`'s
 * promise — both variables set before any handler runs — true without an exception for this one.
 *
 * The handler is deliberately **not** in `src/routes`. Every handler there gates a request
 * against a principal with exactly one `authorize` call, and that one-to-one correspondence is
 * greppable and asserted. This route has no principal to gate, so counting it would either break
 * the count or invite an `authorize` call with nothing to ask about.
 */
export function createAuth(deps: ApiDeps): OpenAPIHono<ServiceEnv> {
  const app = new OpenAPIHono<ServiceEnv>()
  const verifier = new AdminVerifier({ config: deps.config, clock: deps.clock })
  app.use('*', requireService(deps.config.serviceKeys))
  app.openapi(loginRoute, (c) => {
    const { password } = c.req.valid('json')
    if (!verifier.checkPassword(password)) refuseLogin('wrong_password', c.get('service'))
    return c.json(verifier.issue(), 200)
  })
  return app
}
