export { adminFrom, payloadOf } from '@repo/app-session/principal'
export type { AdminPrincipal } from '@repo/app-session/principal'

/**
 * The name of the one cookie this app seals, read by every gated route (ADR 0032).
 *
 * `mp_admin` and not `mt_admin`, which is Microtask's. The two apps are one sign-in *password*
 * and two sessions: they may be open in one browser on two hostnames, and a shared cookie name
 * would have each of them clearing the other's session and reading the other's bearer. The
 * sealing itself is one implementation in `@repo/app-session` and the name is this app's
 * (ADR 0014).
 *
 * There is no second cookie. This app has no share-link surface — when Macroplan reaches
 * Microtask's entities it will do so through share tokens, which are a credential held in a URL
 * and never in a cookie (ADR 0040).
 */
export const ADMIN_COOKIE = 'mp_admin'
