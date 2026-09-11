import { apiForLink } from '../../../../../../../../../../../lib/api'
import { DOCUMENT_REFUSALS } from '../../../../../../../../../../../lib/refusal'
import { putDocument } from '../../../../../../../../../../_document/put-document'

/** The path segments Next hands this handler: the credential, then the tab it writes. */
export interface LinkDocumentRouteContext {
  /** The share token, and the tab named by the whole path down to it. */
  readonly params: Promise<{ token: string; projectId: string; taskId: string; tabId: string }>
}

const withoutToken = (pathname: string): string => pathname.replace(/^\/s\/[^/]+/, '/s/[token]')

/**
 * `PUT` one tab's document through a share link, by the same steps as the admin route
 * (`putDocument`), under the token in this route's own path.
 *
 * It reads **no cookie at all** — the token is the credential (ADR 0040) — so an admin session on
 * the same browser lends a client's save nothing, and a save from `/s/<token>` goes out under that
 * token whatever else the browser holds. A segment that cannot be a token is refused 401 before
 * the body is read.
 *
 * Problems written here name the route with its token segment replaced, so a refusal's body — the
 * kind of thing an error reporter records — does not carry the credential. The API's own
 * refusals name the API path, which never held it.
 */
export async function PUT(request: Request, context: LinkDocumentRouteContext): Promise<Response> {
  const { token, ...tab } = await context.params
  return putDocument(request, {
    instance: withoutToken(new URL(request.url).pathname),
    client: () => Promise.resolve(apiForLink(token)),
    refusedCode: 'unknown_principal',
    copy: DOCUMENT_REFUSALS.link,
    tab,
  })
}
