import { apiForLink } from '../../../../../../../../../../../lib/api'
import { forwardedProblem, problemResponse } from '../../../../../../../../../../api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/problem-response'
import { isSameOrigin } from '../../../../../../../../../../api/projects/[projectId]/tasks/[taskId]/tabs/[tabId]/document/same-origin'
import { documentBody } from './document-body'

/** The path segments Next hands this handler: the credential, then the tab it writes. */
export interface LinkDocumentRouteContext {
  /** The share token, and the tab named by the whole path down to it. */
  readonly params: Promise<{ token: string; projectId: string; taskId: string; tabId: string }>
}

const CROSS_ORIGIN = 'A document write is accepted only from a page this app served.'

const LINK_GONE =
  'This share link is no longer available. This tab keeps its edits until you leave it, but they cannot be saved through this link.'

const withoutToken = (pathname: string): string => pathname.replace(/^\/s\/[^/]+/, '/s/[token]')

/**
 * `PUT` one tab's document through a share link: browser → this handler → API.
 *
 * The link surface's twin of the admin document route, mirrored step for step: the keepalive
 * flush on `beforeunload` cannot dispatch a Server Action, so the save needs a plain Route
 * Handler (ADR 0015), and the admin one reads `mt_admin` alone. This one reads **no cookie at
 * all** — the token in its own path is the credential (ADR 0040), so an admin session on the same
 * browser lends a client's save nothing, and a save from `/s/<token>` goes out under that token
 * whatever else the browser holds.
 *
 * The order is the admin route's, each step spending nothing the one before has not earned: the
 * `Origin` check first — a cross-site page must not be able to drive a write with a token it
 * learned — then the token's shape, then the body. `If-Match` is forwarded verbatim, and the
 * API's answer comes back unchanged in kind: a 409 stays a 409, a 401 a 401 and a 413 a 413.
 *
 * Problems written here name the route with its token segment replaced, so a refusal's body — the
 * kind of thing an error reporter records — does not carry the credential. The API's own
 * refusals name the API path, which never held it.
 */
export async function PUT(request: Request, context: LinkDocumentRouteContext): Promise<Response> {
  const instance = withoutToken(new URL(request.url).pathname)
  if (!isSameOrigin(request.headers)) {
    return problemResponse({ status: 403, code: 'forbidden', detail: CROSS_ORIGIN, instance })
  }
  const { token, ...tab } = await context.params
  const client = apiForLink(token)
  if (client === null) {
    return problemResponse({ status: 401, code: 'unknown_principal', detail: LINK_GONE, instance })
  }
  const body = await documentBody(request, instance)
  if (!body.ok) return body.refusal
  try {
    const saved = await client.tabs.writeDocument(tab, body.document, request.headers.get('if-match') ?? '')
    return Response.json(saved, { status: 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return forwardedProblem(error, instance)
  }
}
