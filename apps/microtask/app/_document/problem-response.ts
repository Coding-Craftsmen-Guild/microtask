import { ApiError } from '@repo/api-client'
import { SERVICE_UNAVAILABLE } from '../../lib/problem'

const TITLES: Readonly<Record<number, string>> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Content Too Large',
  422: 'Unprocessable Content',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
}

/** The members every problem document this route writes carries, beside its extensions. */
export interface ProblemFields {
  /** The HTTP status, which is also the response's status. */
  readonly status: number

  /** The stable code, from the closed set in `@repo/contracts`. */
  readonly code: string

  /** The sentence a browser may show. */
  readonly detail: string

  /** The path the failure is about. */
  readonly instance: string
}

/**
 * One RFC 7807 document, in the shape and media type the API sends its own.
 *
 * The same shape rather than a route-local one, so the browser reads a refusal made here exactly
 * as it reads one the API made: the save island takes `detail` from either without knowing
 * which side of this hop answered.
 */
export function problemResponse(fields: ProblemFields, extensions: object = {}): Response {
  const document = {
    ...extensions,
    type: `/problems/${fields.code}`,
    title: TITLES[fields.status] ?? 'Error',
    ...fields,
  }
  return new Response(JSON.stringify(document), {
    status: fields.status,
    headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
  })
}

const extensionsOf = (error: ApiError): object => ({
  ...(error.maxBytes === null ? {} : { maxBytes: error.maxBytes }),
  ...(error.in === null ? {} : { in: error.in, errors: error.errors }),
})

const UNAUTHORIZED = 401

/**
 * The API's refusal, handed back to the browser **unchanged in kind**.
 *
 * The status is the API's own, whatever it is: a 409 stays a 409, because the island reads a
 * conflict as "reload, never retry" and anything else as "retry in four seconds" (ADR 0016), so
 * turning one into the other either loops a stale write forever or silently drops a good one.
 * A 413 keeps `maxBytes` and a 422 keeps `in` and `errors`, read back off the `ApiError` the
 * client built from the API's document.
 *
 * A 401 keeps its status and code but not its sentence, which is written for an operator — "The
 * bearer token does not name anyone." — and is shown by the island under the editor. It gets
 * `unauthorised` instead, the route's own sentence for a credential that names nobody: sign in
 * again, for an admin whose session lapsed; the link is gone, for a visitor whose link was
 * revoked. The per-cause codes stay for a log, as `lib/problem.ts` keeps them.
 *
 * Anything that is not an `ApiError` — the API unreachable, or a success body the contract
 * refused — is a 503. Never a 500, which would claim this app broke, and never a 200, which
 * would claim the tab was saved.
 */
export function forwardedProblem(error: unknown, instance: string, unauthorised: string): Response {
  if (!(error instanceof ApiError)) {
    return problemResponse({ status: 503, code: 'service_unavailable', detail: SERVICE_UNAVAILABLE, instance })
  }
  const detail = error.status === UNAUTHORIZED ? unauthorised : error.detail
  const fields = { status: error.status, code: error.code, detail, instance: error.instance }
  return problemResponse(fields, extensionsOf(error))
}
