import type { Context, MiddlewareHandler } from 'hono'
import { codeForStatus, problemResponse } from '../http/problem.js'
import type { ApiEnv } from './env.js'
import type { PrincipalResolver } from './principal-resolver.js'

const SCHEME = 'bearer'

const DETAILS: Readonly<Record<string, string>> = {
  unknown_service: 'This request carried no recognised service key.',
  no_principal: 'This request carried no bearer token.',
  unknown_principal: 'The bearer token does not name anyone.',
}

const refuse = (c: Context, code: string): Response =>
  problemResponse({ status: 401, code, detail: DETAILS[code] ?? codeForStatus(401), instance: c.req.path })

function bearerToken(header: string | undefined): string | null {
  if (header === undefined) return null
  const space = header.indexOf(' ')
  if (space < 0 || header.slice(0, space).toLowerCase() !== SCHEME) return null
  const token = header.slice(space + 1).trim()
  return token === '' ? null : token
}

/**
 * The credential guard: every request under it presents a service key **and** a principal token.
 *
 * `x-api-key` says which app is calling and confers no authority whatsoever; the bearer token is
 * the only thing that produces a principal. A service key on its own is refused, which is the
 * confused deputy ADR 0012 exists to close — a Next Server Action is reachable independently of
 * the page that renders it, so a read-only visitor could otherwise have made the app call this
 * API with a credential the API read as "admin".
 *
 * It must be registered **before** the routes it protects. A `.use()` added after the `.route()`
 * or the handler it should cover never runs, and the request still answers 200 — there is no
 * warning and no failing route, only an open endpoint.
 *
 * Neither credential is declared in any route's `request.headers`. A required header schema turns
 * a missing credential into a 400 ZodError instead of the contractual 401, and no header schema
 * can express "an admin token or a share token". `security:` in `createRoute` is documentation
 * only: a route declaring both schemes answered 200 with no credentials at all.
 *
 * This guard authenticates and does not authorize. A share principal scoped to one project
 * reaches every path under the subtree; what stops it reading another project is `authorize()`
 * in the handler, and nothing else.
 */
export function requirePrincipal(
  resolver: PrincipalResolver,
  serviceKeys: ReadonlyMap<string, string>,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const key = c.req.header('x-api-key')
    const service = key === undefined ? undefined : serviceKeys.get(key)
    if (service === undefined) return refuse(c, 'unknown_service')
    const bearer = bearerToken(c.req.header('authorization'))
    if (bearer === null) return refuse(c, 'no_principal')
    const principal = await resolver.resolve(bearer)
    if (principal === null) return refuse(c, 'unknown_principal')
    c.set('service', service)
    c.set('principal', principal)
    await next()
  }
}
