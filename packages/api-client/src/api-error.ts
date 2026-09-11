import { ProblemTarget, ValidationIssue } from '@repo/contracts'
import type { ValidationProblem } from '@repo/contracts'
import type { Decoded, Decoder } from './types.js'

/**
 * Which part of a request a 422 was about.
 *
 * Taken from the published schema rather than spelled out again, so the union a caller switches
 * on is the one the API can actually send (ADR 0036).
 */
export type ValidationTarget = Decoded<typeof ValidationProblem>['in']

/** One field a 422 named, with the message to put beside it. */
export type FieldError = Decoded<typeof ValidationIssue>

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

  /** Which request target a 422 was about, or null for any other failure. */
  readonly in?: ValidationTarget | null

  /** The fields a 422 named. Empty for any other failure. */
  readonly errors?: readonly FieldError[]

  /** The cap a 413 hit, in bytes, or null for any other failure. */
  readonly maxBytes?: number | null
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

  /**
   * Which request target a 422 was about, or `null` for any other failure.
   *
   * Validation short-circuits at the first failing target, so this names where a caller should
   * look next rather than everywhere the request was wrong.
   */
  readonly in: ValidationTarget | null

  /**
   * The fields a 422 named, empty for any other failure.
   *
   * Always an array so a caller can map over it without checking, which is the difference between
   * a form that points at the field that failed and one that says "something went wrong".
   */
  readonly errors: readonly FieldError[]

  /** The cap a 413 hit, in bytes, or `null` for any other failure. */
  readonly maxBytes: number | null

  /** Builds the error from what could be read of the response. */
  constructor(init: ApiErrorInit) {
    super(`${String(init.status)} ${init.code}: ${init.detail}`)
    this.name = 'ApiError'
    this.status = init.status
    this.code = init.code
    this.detail = init.detail
    this.instance = init.instance
    this.in = init.in ?? null
    this.errors = init.errors ?? []
    this.maxBytes = init.maxBytes ?? null
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

const decoded = <Value>(schema: Decoder<Value>, value: unknown): Value | null => {
  try {
    return schema.parse(value)
  } catch {
    return null
  }
}

const targetAt = (source: Readonly<Record<string, unknown>>): ValidationTarget | null =>
  decoded(ProblemTarget, source['in'])

const fieldsAt = (source: Readonly<Record<string, unknown>>): readonly FieldError[] => {
  const raw = source['errors']
  if (!Array.isArray(raw)) return []
  return raw.flatMap((one: unknown) => {
    const field = decoded(ValidationIssue, one)
    return field === null ? [] : [field]
  })
}

const capAt = (source: Readonly<Record<string, unknown>>): number | null => {
  const value = source['maxBytes']
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Reads a failed response into an {@link ApiError}, whatever its body turns out to be.
 *
 * Every error this API sends is `application/problem+json`, but a proxy, a load balancer or a
 * crashed process in between sends whatever it likes — so the document is read field by field
 * and each field falls back rather than the whole parse failing. A client that threw a
 * `SyntaxError` on an HTML gateway page would report the wrong failure entirely, and the status
 * is the one thing always available.
 *
 * The three extension members are read the same way, and each is read **through the published
 * schema** rather than against a copy of its shape here: an `in` the API could never send is
 * dropped rather than widening the union a caller switches on, a malformed field error is dropped
 * while the well-formed ones beside it survive, and a `maxBytes` that is not a finite number is
 * dropped rather than reaching a UI that would render it (ADR 0036).
 */
export async function errorFrom(response: Response, instance: string): Promise<ApiError> {
  const document = documentIn(await response.text())
  return new ApiError({
    status: response.status,
    code: stringAt(document, 'code') ?? `http_${String(response.status)}`,
    detail: stringAt(document, 'detail') ?? response.statusText,
    instance: stringAt(document, 'instance') ?? instance,
    in: targetAt(document),
    errors: fieldsAt(document),
    maxBytes: capAt(document),
  })
}
