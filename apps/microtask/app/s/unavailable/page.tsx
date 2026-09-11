import type { Metadata } from 'next'
import { LINK_UNAVAILABLE_DETAIL, LINK_UNAVAILABLE_TITLE } from '../../../components/link/copy'
import { LinkFrame } from '../../../components/link/link-frame'
import { LINK_UNAVAILABLE_PATH } from '../../../lib/routes'

/** The tab title, legacy's heading for the same state. */
export const metadata = { title: `${LINK_UNAVAILABLE_TITLE} · CC Guild Microtask` } satisfies Metadata

/**
 * `/s/unavailable`: where every link that no longer resolves is sent, and the end of the road.
 *
 * It calls nothing and reads nothing — no API, no cookie, no token — so a reload cannot re-attempt
 * the dead link, which the redirect already took out of the address bar. It clears nothing
 * because there is nothing to clear: the client surface holds no cookie (ADR 0040). It never
 * links to `/login`, and its brand bar links here rather than to `/`, the admin surface, because a
 * client has no password (ADR 0032).
 */
export default function LinkUnavailablePage() {
  return (
    <LinkFrame home={LINK_UNAVAILABLE_PATH}>
      <div className="grid gap-2 pt-6">
        <h1 className="text-2xl font-bold tracking-tight">{LINK_UNAVAILABLE_TITLE}</h1>
        <p className="text-muted-foreground">{LINK_UNAVAILABLE_DETAIL}</p>
      </div>
    </LinkFrame>
  )
}
