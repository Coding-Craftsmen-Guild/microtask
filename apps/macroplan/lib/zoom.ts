import { rungParam } from '@repo/canvas'
import type { Rung } from '@repo/canvas'
import { cookies } from 'next/headers'

/**
 * The cookie the chosen rung is kept in.
 *
 * `mp_` like every other cookie this app owns, and deliberately **not** sealed: `@repo/app-session`'s
 * sealing exists for the admin session, and this holds one of three public words that names a zoom
 * level. Sealing it would imply it were a credential and would put a second key in the deployment for
 * a value anyone can read off the screen.
 */
export const ZOOM_COOKIE = 'mp_zoom'

/**
 * The rung the reader last chose, or `null` if they have never chosen one.
 *
 * ### Why a cookie and not a search param
 *
 * ADR 0057 put the canvas in the plan's `layout.tsx`, so that opening a drawer re-renders a panel of
 * forty elements rather than 2,000 SVG nodes and 2,200 table rows. **A Next layout is not given
 * `searchParams`** — that is the documented consequence of a layout not re-rendering when only a search
 * param changes — so a `?z=` could not reach the canvas without moving it back onto `page.tsx`, which
 * ADR 0057 rejects in as many words: "the layout is not an implementation detail of this decision — it
 * is the decision."
 *
 * A layout *can* read cookies, so this is where the zoom lives. The cost is real and is recorded in the
 * design (§6.3): a zoom level is not in the URL, so it cannot be sent to a colleague and Back does not
 * step out of it. Making the rung a path segment above the drawer would restore both and costs a move
 * of every file under the segment; the design says why that trade is not worth making yet.
 *
 * ### Why `rungParam` and not a cast
 *
 * The cookie is client-writable — anyone can set `mp_zoom` to anything — so the value is validated
 * rather than trusted. `rungParam` answers `null` for junk, so no `ZOOM_VIEW` lookup can miss and no
 * canvas can be asked to draw at a rung that does not exist. That is the whole of the trust boundary
 * for this value: it selects one of three server-held records and is never interpolated into anything.
 *
 * ### Why null rather than a default
 *
 * "Never chose one" and "chose the middle rung" are different facts, and only the caller can act on
 * the difference: with no choice to honour, the page opens the plan at whichever scale fits it, which
 * depends on the plan and cannot be decided here. Defaulting in this function is what made every plan
 * open at one scale whatever its length, and a sixteen-day plan spread across a quarter axis — bars in
 * the first ninety pixels of eleven hundred — is what that looked like.
 */
export async function readZoom(): Promise<Rung | null> {
  const jar = await cookies()
  return rungParam(jar.get(ZOOM_COOKIE)?.value ?? null)
}
