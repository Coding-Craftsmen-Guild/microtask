import { adminClientFor, apiOptions } from '@repo/app-session/api'
import type { AdminClient } from '@repo/api-client'
import { session } from './session'

export { apiOptions, loginWith } from '@repo/app-session/api'

/**
 * The admin client `mp_admin` names, for every route in this app.
 *
 * One credential and one client kind, because this app has one surface. There is deliberately no
 * link client here: `createLinkClient` exists for a share token, and a module in this app that
 * could mint one would be a share token's way into a product that has no share links yet. When
 * Macroplan does reach Microtask's entities through the share-link system, that will be a
 * decision with its own record, not a constructor that was already imported (ADR 0014).
 *
 * `null` means this browser presents no admin session — a cookie that was absent, or one that
 * would not open — and `lib/problem.ts` turns that into `/login?next=`.
 */
export async function apiForSession(): Promise<AdminClient | null> {
  const principal = (await session()).admin()
  return principal === null ? null : adminClientFor(principal, apiOptions())
}
