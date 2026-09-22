import { notFound } from 'next/navigation'

/** A write the API refused, or one an app refused before sending, with the words to show. */
export interface ActionFailure {
  /** Always `false`, which is what a caller switches on. */
  readonly ok: false

  /** The HTTP status the API answered, or `0` when it could not be reached. */
  readonly status: number

  /** The sentence to put in front of the user. */
  readonly detail: string
}

/**
 * What every Server Action answers: the value the API returned, or why not.
 *
 * A value rather than a thrown error, because an action's rejection reaches the browser as an
 * opaque digest in production — the one thing the user needed, the sentence saying why, would be
 * the one thing lost. A 409 in particular is a real conflict the user must see (ADR 0016), and
 * a result they can render is how it reaches them rather than a retry nobody asked for.
 */
export type ActionResult<Value> = { readonly ok: true; readonly value: Value } | ActionFailure

/** A failure an app decided without asking the API, spelled the way the API's are. */
export const rejected = (status: number, detail: string): ActionFailure => ({
  ok: false,
  status,
  detail,
})

const MISSING = new Set([404, 422])

/**
 * A page's own read, answered: a thing the API does not hold — or an id that is not an id, which
 * it answers 422 — renders the route's not-found page rather than a sentence.
 *
 * Every other refusal comes back as its sentence for the page to show in place of what it could
 * not read, rather than thrown into an error boundary that production strips of its message.
 */
export function missingIsNotFound<Value>(result: ActionResult<Value>): ActionResult<Value> {
  if (!result.ok && MISSING.has(result.status)) notFound()
  return result
}

/**
 * Unwraps a call whose own body may refuse, so a refusal decided in the app and one the API
 * decided reach the caller in the same shape.
 */
export const flattened = <Value>(result: ActionResult<ActionResult<Value>>): ActionResult<Value> =>
  result.ok ? result.value : result
