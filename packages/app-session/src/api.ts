import { login, type AdminSessionValue, type ClientOptions } from '@repo/api-client'
import { appEnv } from './env'

/**
 * Where the API is and which app is calling, assembled from the one environment reader.
 *
 * `@repo/api-client` reads no environment variable anywhere and takes both as arguments, because
 * the service key names the *server* making the call: a client that read it for itself would be
 * usable from a browser bundle only by inlining the key into that bundle (ADR 0012).
 *
 * Each app supplies its own `API_KEY`, so the API records which product made every call
 * (ADR 0014).
 */
export function apiOptions(): ClientOptions {
  const env = appEnv()
  return { baseUrl: env.apiBaseUrl, serviceKey: env.apiKey }
}

/**
 * Exchanges the admin password for the bearer the admin cookie wraps.
 *
 * It is the one call an app makes that presents a service key with no bearer, because the bearer
 * is what it returns. Everything else in the API refuses that combination with a 401. The route
 * is `/v1/auth/login`, which is product-agnostic: both apps sign in against the one
 * `ADMIN_PASSWORD` (ADR 0012, ADR 0014).
 */
export function loginWith(password: string): Promise<AdminSessionValue> {
  return login(apiOptions(), password)
}
