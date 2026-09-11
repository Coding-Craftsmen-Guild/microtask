import { linkPath } from '../../../components/link/paths'

/** The segment Next hands the legacy redirect. */
export interface LegacyShareContext {
  /** Whatever followed `/share/`, unvalidated: the page it is sent to decides what it names. */
  readonly params: Promise<{ token: string }>
}

/**
 * `GET /share/<token>`: a `308` to `/s/<token>`, for the share links already in clients' hands
 * (ADR 0037, amending ADR 0022's `301`).
 *
 * The redirect is to the token's canonical form, so a project-scoped client lands on their list
 * and a task-scoped one on their task, and the query string travels with it, so a legacy
 * `?tab=` still opens its tab. The `Location` is a path, not an absolute URL: it resolves against
 * whatever host the client asked, behind any proxy, with no host header read here.
 *
 * It carries the `/s/*` hardening itself — no referrer, no index, no storing — because the
 * redirect's own URL holds the token too (ADR 0040). One segment only: `/share/a/b` matches no
 * route and is a 404, where the app being replaced served its share page for any two segments.
 */
export async function GET(request: Request, context: LegacyShareContext): Promise<Response> {
  const { token } = await context.params
  const { search } = new URL(request.url)
  return new Response(null, {
    status: 308,
    headers: {
      location: `${linkPath(token)}${search}`,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
      'x-robots-tag': 'noindex, nofollow',
    },
  })
}
