import { problemSchema, validationProblemSchema } from './error-schemas.js'
import { PROBLEM_MEDIA_TYPE, titleForStatus } from './problem.js'

/** One `responses` entry, as `createRoute` expects it. */
export interface ProblemResponseSpec {
  /** The status title, which is what an OpenAPI response description is for. */
  readonly description: string

  /** The single media type an error is ever served as. */
  readonly content: Readonly<Record<string, { readonly schema: unknown }>>
}

/**
 * The statuses a guarded route can answer with no matter what it does: the credential guard's
 * 401, the authorization gate's 403, a missing resource, a schema failure, and the catch-all.
 */
export const COMMON_ERROR_STATUSES: readonly number[] = [401, 403, 404, 422, 500]

const specFor = (status: number): ProblemResponseSpec => ({
  description: titleForStatus(status),
  content: {
    [PROBLEM_MEDIA_TYPE]: { schema: status === 422 ? validationProblemSchema : problemSchema },
  },
})

/**
 * The error half of a route's `responses`, ready to spread beside its success entries.
 *
 * `security:` in `createRoute` is documentation only — a route declaring both bearer schemes
 * answered 200 with no credentials at all — so these entries are documentation too. What
 * enforces them is the middleware and the gate; what this buys is a generated client that knows
 * a 403 is a problem document rather than the success shape.
 */
export function problemResponses(extra: readonly number[] = []): Record<number, ProblemResponseSpec> {
  const statuses = new Set([...COMMON_ERROR_STATUSES, ...extra])
  return Object.fromEntries([...statuses].map((status) => [status, specFor(status)]))
}
