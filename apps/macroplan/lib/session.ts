import { adminSession } from '@repo/app-session/session'
import type { SessionCookies } from '@repo/app-session/cookies'
import { ADMIN_COOKIE } from './principal'

export type { SessionCookies } from '@repo/app-session/cookies'

/**
 * This app's admin session: {@link adminSession} bound to `mp_admin`.
 *
 * The binding is the whole file. The sealing, the cookie attributes and the "a cookie that will
 * not open is absent" rule are one implementation in `@repo/app-session`, shared with Microtask,
 * which binds `mt_admin` instead (ADR 0014, ADR 0032).
 */
export function session(): Promise<SessionCookies> {
  return adminSession(ADMIN_COOKIE)
}
