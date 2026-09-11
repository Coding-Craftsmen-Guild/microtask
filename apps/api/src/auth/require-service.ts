import type { MiddlewareHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { ServiceEnv } from './env.js'

/** Why a login attempt was refused, as the server records it and the caller never learns. */
export type LoginRefusal = 'unknown_service' | 'wrong_password'

const DETAIL = 'The credentials presented were not accepted.'

/**
 * Records which of the two refusals happened, so an operator can tell them apart.
 *
 * The response cannot say, and that is the point: a body distinguishing "your key is unknown"
 * from "your password is wrong" would confirm a valid service key to anyone holding a stolen
 * one, and would tell a password guesser that its other credential is good. The server still
 * needs the distinction — one is a misconfigured caller, the other is someone guessing — so it
 * goes to the log, which is the side of the boundary that may know.
 *
 * A line rather than a counter or a span, because this API has no observability stack yet. Plan
 * 5 owns rate limiting on this route and will want a signal to attach to; this is the signal,
 * and it is deliberately a shape (`event` plus `reason`) rather than a sentence.
 */
export function reportLoginRefusal(reason: LoginRefusal, service: string | null): void {
  console.warn(JSON.stringify({ event: 'auth.login.refused', reason, service }))
}

/**
 * The one 401 the login route ever answers with, whichever credential was wrong.
 *
 * It **throws** rather than returning a response, for two reasons that happen to agree. The
 * error handler is then the single place the document is built, so the guard's refusal and the
 * handler's are the same bytes by construction rather than by two constructions that have to be
 * kept in step. And a route whose responses carry content schemas types its handler's return as
 * that content, so a bare `Response` returned from one does not typecheck at all — throwing is
 * how an error leaves a handler here, with no cast and no second success shape.
 *
 * `HTTPException` and not an `AppError`: the kernel has no 401, because nothing in the domain
 * knows what a credential is. The handler keys on `.status` alone, so the document carries the
 * generic `unauthorized` code rather than the specific one the principal guard uses —
 * `unknown_service` is safe to disclose on a route with no password behind it, and an oracle on
 * this one.
 */
export function refuseLogin(reason: LoginRefusal, service: string | null): never {
  reportLoginRefusal(reason, service)
  throw new HTTPException(401, { message: DETAIL })
}

/**
 * The service-key guard: the caller must name itself, and need not be anybody yet.
 *
 * It is the credential half of `requirePrincipal` without the principal half, and it exists for
 * exactly one route. `POST /v1/auth/login` cannot demand a bearer token — the token is what it
 * issues — but dropping the service key with it would leave the only unauthenticated write in
 * this API reachable by anything that can open a socket to it. The key confers no authority
 * either way (ADR 0012); it says which app is calling, which is what the refusal log records.
 *
 * Registered before the route it protects, like every other middleware here: a `.use()` added
 * after the `.openapi()` it should cover never runs and the request still answers 200.
 */
export function requireService(
  serviceKeys: ReadonlyMap<string, string>,
): MiddlewareHandler<ServiceEnv> {
  return async (c, next) => {
    const key = c.req.header('x-api-key')
    const service = key === undefined ? undefined : serviceKeys.get(key)
    if (service === undefined) refuseLogin('unknown_service', null)
    c.set('service', service)
    await next()
  }
}
