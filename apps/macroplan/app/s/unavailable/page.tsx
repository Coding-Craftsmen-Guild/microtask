import { COLUMN } from '@repo/ui/shell/page'
import type { Metadata } from 'next'
import { LinkFrame } from '../../../components/link/link-frame'
import { ACTION_REFUSALS } from '../../../lib/refusal'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

const TITLE = 'Link unavailable'

/** The tab title, the same words the page's own heading uses. */
export const metadata = { title: `${TITLE} · CC Guild Macroplan` } satisfies Metadata

/**
 * `/s/unavailable`: where every share link that no longer resolves is sent, and the end of the road.
 *
 * It calls nothing and reads nothing — no API, no cookie, no token — so a reload cannot re-attempt
 * the dead link, which the redirect has already taken out of the address bar. It clears nothing
 * because there is nothing to clear: this surface holds no cookie (ADR 0040). It never links to
 * `/login`, and its brand bar links **here** rather than to `/`, the admin surface, because a plan
 * seat has no password (ADR 0032).
 *
 * The sentence is `ACTION_REFUSALS.link.unauthorised` rather than a second copy of it. That is the
 * wording a link 401 has in this app, and this page is where a link 401 lands — `lib/refusal.ts`
 * calls it "here for completeness" because no *action* can put it on screen, and this is the one
 * place that can. One string, so the redirect and the page cannot come to say different things.
 *
 * It caps itself at legacy's 900px column with `COLUMN`, for the reason `app/(admin)/page.tsx` does:
 * the frame above it is `wide` for the timeline that is the surface's real page, and two lines of
 * prose stretched across a wide monitor is not a page. The cap is imported rather than written out
 * again, so it cannot drift from the one `Page` renders.
 */
export default function LinkUnavailablePage() {
  return (
    <LinkFrame home={LINK_UNAVAILABLE_PATH}>
      <div className={COLUMN}>
        <div className="grid justify-items-center gap-3 py-16 text-center">
          <h1 className="text-xl font-semibold">{TITLE}</h1>
          <p className="text-muted-foreground">{ACTION_REFUSALS.link.unauthorised}</p>
        </div>
      </div>
    </LinkFrame>
  )
}
