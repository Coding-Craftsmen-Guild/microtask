import type { Context, ValidationTargets } from 'hono'
import type { ZodError } from 'zod'
import { codeForStatus, problemResponse } from './problem.js'

/** One field that failed validation, flattened for a client to act on. */
export interface ValidationIssue {
  /** Dotted path to the field, such as `tabs.0.id`. */
  readonly path: string

  /** Zod's human-readable explanation. */
  readonly message: string

  /** Zod's machine-readable issue code. */
  readonly code: string
}

/** What `@hono/zod-openapi` hands a hook, on success as well as on failure. */
export type ValidationResult<T = unknown> = { readonly target: keyof ValidationTargets } & (
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ZodError }
)

const DETAIL = 'The request did not match the schema for this route.'

const issues = (error: ZodError): readonly ValidationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
    code: issue.code,
  }))

/**
 * Reshapes a validation failure into a 422 problem document.
 *
 * The success guard is the first line because this hook runs on **every** validated target,
 * passing ones included; without it a valid request would be answered with a 422 built from an
 * error that does not exist. Returning nothing lets the request proceed.
 *
 * A failure never reaches `app.onError` — hono answers it directly with a raw 400 carrying the
 * stringified `ZodError` — so this hook is the only place the shape can be fixed, and it must be
 * passed to the **root** constructor as `defaultHook` or to `app.openapi()` as its third
 * positional argument. A `hook` key inside the `createRoute` config is silently ignored.
 *
 * Only one target is ever reported. Validators run query, param, header, cookie, then json, and
 * the first failure short-circuits, so `in` names where the caller should look next and a request
 * wrong in two places takes two round trips to fix.
 */
export function validationHook<T>(result: ValidationResult<T>, c: Context): Response | undefined {
  if (result.success) return
  return problemResponse(
    { status: 422, code: codeForStatus(422), detail: DETAIL, instance: c.req.path },
    { in: result.target, errors: issues(result.error) },
  )
}
