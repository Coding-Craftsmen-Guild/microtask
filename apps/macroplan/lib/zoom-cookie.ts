import type { Rung } from '@repo/canvas'

/**
 * The cookie the chosen rung is kept in.
 *
 * `mp_` like every other cookie this app owns, and deliberately **not** sealed: it holds one of three
 * public words naming a zoom level, and `readZoom` (`./zoom.ts`) validates it on the way back in because
 * anyone can set it to anything. It is in a module of its own so the browser can write it — `./zoom.ts`
 * reads it through `next/headers`, which a client bundle may not import.
 */
export const ZOOM_COOKIE = 'mp_zoom'

const A_YEAR_IN_SECONDS = 60 * 60 * 24 * 365

/**
 * Keeps the rung a reader chose, so the next page load opens at it.
 *
 * Zoom used to be a Server Action that set this cookie and revalidated the plan layout: every wheel flick
 * and every switch was a round trip and a re-render of the whole plan on the server. It is client state now
 * (ADR 0069) — the canvas redraws in the browser in the same frame — and the one thing the server still
 * needs, which rung to open at, is this cookie, written here with the options the action wrote it with.
 *
 * @param rung - The rung now on screen.
 */
export function rememberZoom(rung: Rung): void {
  document.cookie = `${ZOOM_COOKIE}=${rung}; path=/; max-age=${String(A_YEAR_IN_SECONDS)}; samesite=lax`
}
