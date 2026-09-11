import { z } from '@hono/zod-openapi'

/**
 * The RFC 7807 document every error response carries.
 *
 * `code` is an extension member rather than a reuse of `type`, so a client switches on a short
 * stable string while `type` stays a URI reference the way the RFC requires.
 */
export const problemSchema = z
  .object({
    type: z.string().openapi({ example: '/problems/forbidden' }),
    title: z.string().openapi({ example: 'Forbidden' }),
    status: z.int().openapi({ example: 403 }),
    code: z.string().openapi({ example: 'forbidden' }),
    detail: z.string().openapi({ example: 'Not permitted' }),
    instance: z.string().openapi({ example: '/v1/microtask/projects/01M240ERCRWWCN16Q5AHP1FZAQ' }),
  })
  .openapi('Problem')

/**
 * The 422 document, which additionally names the one target that failed.
 *
 * `in` is required rather than optional: validation short-circuits at the first failing target,
 * so a client that cannot see which one it was has no way to know whether fixing the reported
 * fields will be enough.
 */
export const validationProblemSchema = problemSchema
  .extend({
    in: z.enum(['query', 'param', 'header', 'cookie', 'json', 'form']).openapi({ example: 'query' }),
    errors: z.array(
      z.object({
        path: z.string().openapi({ example: 'tabs.0.id' }),
        message: z.string().openapi({ example: 'Invalid input' }),
        code: z.string().openapi({ example: 'invalid_type' }),
      }),
    ),
  })
  .openapi('ValidationProblem')
