import { ApiError } from '@repo/api-client'
import { SERVICE_UNAVAILABLE } from '../../lib/problem'
import { plainRefusal, type RefusalCopy } from '../../lib/refusal'

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

/**
 * The API's refusal, handed back to the browser **unchanged in kind**.
 *
 * The status is the API's own, whatever it is, because the island decides on it: a 409 is
 * "reload, never retry", a 408, 429 or 5xx is "retry in four seconds", and any other refusal is
 * "stop, and retry when asked" (ADR 0016). Turning one into another either loops a write that
 * cannot land, or gives up on one that could.
 * A 413 keeps `maxBytes` and a 422 keeps `in` and `errors`, read back off the `ApiError` the
 * client built from the API's document.
 *
 * No refusal keeps its sentence, which is written for whoever reads the API — "The bearer token
 * does not name anyone.", "Not permitted: tab:write" — and would be shown by the island under
 * the editor. Each gets the surface's own plain sentence for its status from `copy` instead
 * (`lib/refusal.ts`): sign in again, for an admin whose session lapsed; the link is gone, for a
 * visitor whose link was revoked; the link is read-only now, for one downgraded to view. The
 * status and the per-cause code stay, because the island decides retry or stop on the status
 * and a log reads the code.
 *
 * Anything that is not an `ApiError` — the API unreachable, or a success body the contract
 * refused — is a 503. Never a 500, which would claim this app broke, and never a 200, which
 * would claim the tab was saved.
 */
export function forwardedProblem(error: unknown, instance: string, copy: RefusalCopy): Response {
  return forwardedNaming(error, instance, copy, error instanceof ApiError ? error.instance : instance)
}

function forwardedNaming(
  error: unknown,
  instance: string,
  copy: RefusalCopy,
  named: string,
): Response {
  if (!(error instanceof ApiError)) {
    return problemResponse({ status: 503, code: 'service_unavailable', detail: SERVICE_UNAVAILABLE, instance })
  }
  const detail = plainRefusal(error.status, copy)
  return problemResponse({ status: error.status, code: error.code, detail, instance: named }, extensionsOf(error))
}

/**
 * The same refusal, named by the path **this app** answers on rather than the API's.
 *
 * {@link forwardedProblem} echoes `error.instance`, which is the internal API path — and the API
 * is internal-only, with no published port and no domain (ADR 0041), so that path names something
 * no browser can reach and nothing outside the deployment should be told about. It is what the two
 * proxying handlers would otherwise answer a 409 or a 413 with: `/v1/microtask/import/sessions/…`
 * in place of `/api/import/upload`.
 *
 * It is a second function rather than a change to the first because the two document routes pin
 * the API's path in their own tests, deliberately — there the `instance` is a log trail across a
 * hop the editor island knows about. Correcting that is a change to a shipped surface and belongs
 * with whoever owns it; this is the version the routes added here use.
 *
 * Everything else is identical: the status is the API's, the sentence is this surface's, and a
 * 413 keeps `maxBytes` so the browser can name the cap.
 */
export function proxiedProblem(error: unknown, instance: string, copy: RefusalCopy): Response {
  return forwardedNaming(error, instance, copy, instance)
}
