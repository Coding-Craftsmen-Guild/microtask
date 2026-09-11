import type { OpenAPIHono } from '@hono/zod-openapi'

/** The registry a root app exposes as `openAPIRegistry`, named so nothing has to import it. */
export type SchemeRegistry = OpenAPIHono['openAPIRegistry']

/** The document's name for `x-api-key`, which says which app is calling (ADR 0012). */
export const SERVICE_KEY_SCHEME = 'serviceKey'

/** The document's name for the bearer credential, which is the only thing that names a principal. */
export const PRINCIPAL_TOKEN_SCHEME = 'principalToken'

/**
 * The `security` entry a guarded route declares.
 *
 * One requirement object holding both schemes, which OpenAPI reads as *and*. Two objects would
 * read as *or*, and either credential on its own is a 401 — a service key with no principal is
 * the confused deputy ADR 0012 closes.
 *
 * One bearer scheme covers both principal kinds rather than two. An admin token and a share
 * token arrive in the same header and are told apart by resolving them, so a document that named
 * two bearer schemes would be describing a distinction no client can act on (ADR 0013).
 */
export const GUARDED_SECURITY = [{ [SERVICE_KEY_SCHEME]: [], [PRINCIPAL_TOKEN_SCHEME]: [] }]

/**
 * Registers the two credentials this API accepts as OpenAPI security schemes.
 *
 * **This enforces nothing.** A route declaring both schemes answered 200 with no credentials at
 * all, and a misspelled scheme name is emitted with no warning — measured both ways, and the
 * tests beside this file pin both. What refuses a request is `requirePrincipal`, mounted ahead
 * of everything it protects; what refuses an out-of-scope one is `authorize` inside the handler.
 * These declarations exist so a generated client knows which headers to send, and so a reader of
 * the document is not left guessing what "401" means.
 */
export function registerSecuritySchemes(registry: SchemeRegistry): void {
  registry.registerComponent('securitySchemes', SERVICE_KEY_SCHEME, {
    type: 'apiKey',
    in: 'header',
    name: 'x-api-key',
    description: 'Identifies the calling app. It confers no authority on its own.',
  })
  registry.registerComponent('securitySchemes', PRINCIPAL_TOKEN_SCHEME, {
    type: 'http',
    scheme: 'bearer',
    description: 'An admin token from POST /v1/auth/login, or a share-link token.',
  })
}
