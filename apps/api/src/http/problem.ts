import type { ProblemCodeValue } from '@repo/contracts'

/** The media type RFC 7807 defines for a problem document. */
export const PROBLEM_MEDIA_TYPE = 'application/problem+json'

/** Everything an error response needs that is not derivable from the status. */
export interface ProblemInit {
  /** The HTTP status this problem is reported with. */
  readonly status: number

  /**
   * A stable machine-readable name for the failure, matching `AppError.code` where one exists.
   *
   * A bare string rather than `ProblemCodeValue`, because a domain error carries its own code and
   * the kernel cannot depend on `@repo/contracts` — the dependency runs the other way, and only
   * as a devDependency (ADR 0038). What keeps the set closed on this path is a test enumerating
   * every `AppError` subclass against `PROBLEM_CODES`; what keeps it closed on the status path is
   * the `ProblemCodeValue` annotation on {@link StatusMeaning}.
   */
  readonly code: string

  /** A human-readable explanation, safe to show a caller. */
  readonly detail: string

  /** The request path this occurred on. */
  readonly instance: string
}

/** Further members merged into the document, such as the `in` and `errors` a 422 carries. */
export type ProblemExtensions = Readonly<Record<string, unknown>>

/** What one status is reported as: its human-readable title and its stable code. */
export interface StatusMeaning {
  /** The human-readable title the status is reported with. */
  readonly title: string

  /** The stable code the status is reported under, drawn from the published closed set. */
  readonly code: ProblemCodeValue
}

/**
 * What each status this API answers with means, as the one table both halves of a problem
 * document are read from.
 *
 * Exported so the contract test can enumerate it rather than restate it: `ProblemCode` in
 * `@repo/contracts` is the published closed set, and a code added here that the contract omits
 * has to fail a test rather than reach a client under a name no app can switch on (ADR 0036).
 * The `ProblemCodeValue` annotation is the compiler's half of the same check.
 */
export const MEANINGS: Readonly<Record<number, StatusMeaning>> = {
  400: { title: 'Bad Request', code: 'bad_request' },
  401: { title: 'Unauthorized', code: 'unauthorized' },
  403: { title: 'Forbidden', code: 'forbidden' },
  404: { title: 'Not Found', code: 'not_found' },
  405: { title: 'Method Not Allowed', code: 'method_not_allowed' },
  409: { title: 'Conflict', code: 'conflict' },
  413: { title: 'Content Too Large', code: 'payload_too_large' },
  415: { title: 'Unsupported Media Type', code: 'unsupported_media_type' },
  422: { title: 'Unprocessable Content', code: 'invalid' },
  429: { title: 'Too Many Requests', code: 'too_many_requests' },
  500: { title: 'Internal Server Error', code: 'internal_error' },
  503: { title: 'Service Unavailable', code: 'service_unavailable' },
}

/** What a status outside {@link MEANINGS} is reported as, which keeps the code set closed. */
export const UNMAPPED: StatusMeaning = { title: 'Error', code: 'http_error' }

const meaning = (status: number): StatusMeaning => MEANINGS[status] ?? UNMAPPED

/** The human-readable title a status is reported with. */
export const titleForStatus = (status: number): string => meaning(status).title

/**
 * The stable code a status is reported with when the thrown error supplies none.
 *
 * It agrees with the kernel's `AppError` codes on the statuses they share, so one failure never
 * reaches a client under two different names depending on which branch produced it.
 */
export const codeForStatus = (status: number): ProblemCodeValue => meaning(status).code

/**
 * Builds an RFC 7807 error response from scratch.
 *
 * Deliberately `new Response` rather than `c.json`: `c.json` folds in the headers a handler
 * already prepared on the context, so a measured 403 carried the `etag` of the resource it was
 * refusing — telling the caller that resource exists. A response constructed here starts from no
 * headers at all, so nothing a handler set can ride along (ADR 0009 is only as strong as this).
 * Extension members are merged underneath the core ones, so a caller-supplied `status` or
 * `instance` cannot overwrite the real one.
 */
export function problemResponse(init: ProblemInit, extensions: ProblemExtensions = {}): Response {
  const document = {
    ...extensions,
    type: `/problems/${init.code}`,
    title: titleForStatus(init.status),
    status: init.status,
    code: init.code,
    detail: init.detail,
    instance: init.instance,
  }
  return new Response(JSON.stringify(document), {
    status: init.status,
    headers: { 'content-type': PROBLEM_MEDIA_TYPE, 'cache-control': 'no-store' },
  })
}
