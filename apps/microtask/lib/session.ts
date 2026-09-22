import { adminSession } from '@repo/app-session/session'
import type { SessionCookies } from '@repo/app-session/cookies'
import { ADMIN_COOKIE } from './principal'

export type { SessionCookies } from '@repo/app-session/cookies'

/**
 * This app's admin session: {@link adminSession} bound to `mt_admin`.
 *
 * The binding is the whole file, and it is the only thing about the session that is this app's:
 * the sealing, the cookie attributes and the "a cookie that will not open is absent" rule are
 * one implementation in `@repo/app-session`, shared with Macroplan, which binds `mp_admin`
 * instead (ADR 0014, ADR 0032).
 *
 * Only the admin surface calls this. A `/s/*` route takes its credential from its URL and never
 * asks for a session at all (ADR 0040).
 */
export function session(): Promise<SessionCookies> {
  return adminSession(ADMIN_COOKIE)
}
