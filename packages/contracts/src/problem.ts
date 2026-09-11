import { z } from 'zod'

/**
 * Every stable code the API can report a failure under, as one closed list (ADR 0036).
 *
 * Three groups, and the second is the reason this is published rather than left private to the
 * API. The status-derived codes come from the one status-to-meaning table `apps/api` holds. The
 * three `401`s name *which* credential was missing, a distinction a generic `unauthorized`
 * cannot carry and the app needs, because `unknown_principal` on a share token means "this link
 * is gone" while `no_principal` means "this browser has no cookie". `http_error` is what a
 * status outside the table is reported under, so the list stays closed.
 *
 * Not `Problem.code`'s type: a proxy or a crashed process in between sends whatever it likes,
 * and `@repo/api-client` deliberately falls back to `http_<status>` for a body it could not
 * read. This is the set to switch on, not the set to validate a stranger's response against.
 */
export const PROBLEM_CODES = [
  'bad_request',
  'unauthorized',
  'forbidden',
  'not_found',
  'method_not_allowed',
  'conflict',
  'payload_too_large',
  'unsupported_media_type',
  'invalid',
  'too_many_requests',
  'internal_error',
  'service_unavailable',
  'http_error',
  'unknown_service',
  'no_principal',
  'unknown_principal',
] as const

/** A stable machine-readable name for a failure, as the API reports it. */
export const ProblemCode = z
  .enum(PROBLEM_CODES)
  .meta({ id: 'ProblemCode', description: 'The stable code a failure is reported under' })

/** One of the codes in {@link PROBLEM_CODES}. */
export type ProblemCodeValue = (typeof PROBLEM_CODES)[number]

/**
 * Where a validation failure was found.
 *
 * Validators run query, param, header, cookie, then json, and the first failure
 * short-circuits — so this names where a caller should look next rather than everywhere it was
 * wrong.
 */
export const ProblemTarget = z
  .enum(['query', 'param', 'header', 'cookie', 'json', 'form'])
  .meta({ id: 'ProblemTarget', description: 'Which part of a request failed validation' })

/** One field that failed validation, flattened for a client to put on a form field. */
export const ValidationIssue = z
  .object({ path: z.string(), message: z.string(), code: z.string() })
  .meta({ id: 'ValidationIssue', description: 'One field that failed validation' })

/**
 * The RFC 7807 document every error response carries.
 *
 * `code` is a plain string rather than {@link ProblemCode}. Every error this API sends is one of
 * that closed set, but a load balancer or a crashed process in between sends whatever it likes,
 * and a schema that refused those would turn a gateway page into a parse error instead of the
 * failure that actually happened.
 */
export const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number().int(),
    code: z.string(),
    detail: z.string(),
    instance: z.string(),
  })
  .meta({ id: 'Problem', description: 'The RFC 7807 document every error response carries' })

/**
 * The 422 document, which additionally names the one target that failed and the fields in it.
 *
 * `in` is required rather than optional: validation short-circuits at the first failing target,
 * so a client that cannot see which one it was has no way to know whether fixing the reported
 * fields will be enough.
 */
export const ValidationProblem = Problem.extend({
  in: ProblemTarget,
  errors: z.array(ValidationIssue).readonly(),
}).meta({ id: 'ValidationProblem', description: 'A 422, naming the target and fields that failed' })
