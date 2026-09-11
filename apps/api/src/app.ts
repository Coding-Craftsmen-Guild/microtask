import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import type { ApiEnv } from './auth/env.js'
import type { ApiDeps } from './deps.js'
import { globalBodyLimit } from './http/body-limits.js'
import { DOCS_PATH, DOC_PATH, docConfig, docsHandler } from './http/docs.js'
import { errorHandler } from './http/error-handler.js'
import { notFoundHandler } from './http/not-found.js'
import { registerSecuritySchemes } from './http/security.js'
import { validationHook } from './http/validation-hook.js'
import { createV1 } from './routes/v1.js'

export { DOCS_PATH, DOC_PATH, docConfig, type DocConfig } from './http/docs.js'

const healthz = createRoute({
  method: 'get',
  path: '/healthz',
  tags: ['meta'],
  summary: 'Report that the process is serving',
  description: 'Carries no credential and reads no storage, so it answers while the disk is busy.',
  responses: {
    200: {
      description: 'The process is serving',
      content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } },
    },
  },
})

/**
 * Assembles the whole API from its injected dependencies.
 *
 * **The order of these statements is the design, not a style.** Four separate measured failures
 * live in it, every one of them silent:
 *
 * - `defaultHook` is passed to the **constructor**, because a validation failure never reaches
 *   `onError`. Hono answers it directly with a raw 400 carrying a stringified `ZodError`, and
 *   only a hook given here reshapes it. A `hook` key inside a `createRoute` config is ignored.
 * - The body limit is registered **before** anything is mounted. Registered after, it never runs
 *   and an oversized body is accepted with a 200. It is also ahead of the credential guard, so a
 *   20 MB body on an unauthenticated socket is refused without being read.
 * - `route('/v1', …)` comes **after** every root-level route and middleware, and takes a child
 *   that is already complete. Mounting copies the child's registered routes into this document,
 *   so a route added to the child afterwards is absent from the document *and* unreachable.
 * - `onError` and `notFound` come last so they cover everything above them.
 *
 * The doc route is served for a human at the console; it is not how `openapi.json` is produced.
 * When schema generation throws, that route answers 500 with a body that still parses as JSON, so
 * a CI step piping it to a file exits 0 and overwrites a good document with an error object. The
 * build script emits it instead, and exits 1 having written nothing.
 */
export function createApp(deps: ApiDeps): OpenAPIHono<ApiEnv> {
  const app = new OpenAPIHono<ApiEnv>({ defaultHook: validationHook })
  registerSecuritySchemes(app.openAPIRegistry)
  app.use('*', globalBodyLimit)
  app.openapi(healthz, (c) => c.json({ status: 'ok' }, 200))
  app.doc31(DOC_PATH, docConfig)
  app.get(DOCS_PATH, docsHandler)
  app.route('/v1', createV1(deps))
  app.onError(errorHandler)
  app.notFound(notFoundHandler)
  return app
}
