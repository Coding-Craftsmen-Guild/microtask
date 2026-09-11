/** Everything an {@link ApiError} carries, every field of it read from the problem document. */
export interface ApiErrorInit {
  /** The HTTP status the API answered with. */
  readonly status: number

  /** The stable machine-readable name of the failure, such as `conflict` or `forbidden`. */
  readonly code: string

  /** The human-readable explanation the API supplied, safe to show a caller. */
  readonly detail: string

  /** The request path this happened on. */
  readonly instance: string
}

/**
 * Any response that was not the success the caller asked for.
 *
 * One error class rather than one per status, because the interesting distinction is `code` and
 * `status` — both of which a caller switches on — and a hierarchy would have to be kept in step
 * with a list of statuses the API is free to extend. A `409` in particular is a **normal**
 * outcome of a conditional write and means reload-and-retry rather than a defect (ADR 0016), so
 * a caller that keys on `status` reads it without having to catch a distinct type.
 *
 * It is an `Error` subclass so it survives every dispatcher that guards with `instanceof Error`,
 * and so a rejection carries a stack pointing at the call that made it.
 */
export class ApiError extends Error {
  /** The HTTP status the API answered with. */
  readonly status: number

  /** The stable machine-readable name of the failure. */
  readonly code: string

  /** The human-readable explanation the API supplied. */
  readonly detail: string

  /** The request path this happened on. */
  readonly instance: string

  /** Builds the error from what could be read of the response. */
  constructor(init: ApiErrorInit) {
    super(`${String(init.status)} ${init.code}: ${init.detail}`)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.instance = init.instance
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const documentIn = (raw: string): Readonly<Record<string, unknown>> => {
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const stringAt = (source: Readonly<Record<string, unknown>>, key: string): string | null => {
  const value = source[key]
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Reads a failed response into an {@link ApiError}, whatever its body turns out to be.
 *
 * Every error this API sends is `application/problem+json`, but a proxy, a load balancer or a
 * crashed process in between sends whatever it likes — so the document is read field by field
 * and each field falls back rather than the whole parse failing. A client that threw a
 * `SyntaxError` on an HTML gateway page would report the wrong failure entirely, and the status
 * is the one thing always available.
 */
export async function errorFrom(response: Response, instance: string): Promise<ApiError> {
  const document = documentIn(await response.text())
  return new ApiError({
    status: response.status,
    code: stringAt(document, 'code') ?? `http_${String(response.status)}`,
    detail: stringAt(document, 'detail') ?? response.statusText,
    instance: stringAt(document, 'instance') ?? instance,
  })
}
