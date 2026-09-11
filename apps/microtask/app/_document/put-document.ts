import type { TabRef } from '@repo/api-client'
import type { SessionClient } from '../../lib/api'
import { documentBody } from './document-body'
import { forwardedProblem, problemResponse } from './problem-response'
import { isSameOrigin } from './same-origin'

/** What one surface's document route hands {@link putDocument}: its credential, and its tab. */
export interface DocumentWrite {
  /** The path every problem written here names; the link route's has its token segment replaced. */
  readonly instance: string

  /**
   * Resolves the one credential the route presents, called only once the `Origin` check has
   * passed: `mt_admin` for the admin route, the path's own token for the link route (ADR 0040).
   */
  readonly client: () => Promise<SessionClient | null>

  /** The 401 a request with no such credential gets: its code, and the sentence the island shows. */
  readonly refused: { readonly code: string; readonly detail: string }

  /** The tab written, named by the whole path down to it. */
  readonly tab: TabRef
}

const CROSS_ORIGIN = 'A document write is accepted only from a page this app served.'

/**
 * `PUT` one tab's document: browser → a document route → API, the same steps for both surfaces.
 *
 * It exists because nothing can dispatch a Server Action on unload, so the keepalive flush the
 * editor island sends on `beforeunload` needs a plain Route Handler (ADR 0015) — one per surface,
 * because each presents a different credential and neither may present the other's. The steps are
 * one body so the two cannot drift, and they run in an order where each spends nothing the step
 * before has not earned: the `Origin` check first, so a cross-site page cannot drive a write with a
 * credential it learned, then the credential, then the body.
 *
 * `If-Match` is forwarded **verbatim**; an absent one goes on as the empty string, and the API's
 * own validation answers it, so "is a precondition required" has one authority (ADR 0016). The
 * API's answer comes back unchanged in kind — a 409 stays a 409, a 401 a 401 and a 413 a 413; see
 * {@link forwardedProblem}.
 */
export async function putDocument(request: Request, write: DocumentWrite): Promise<Response> {
  const { instance } = write
  if (!isSameOrigin(request.headers)) {
    return problemResponse({ status: 403, code: 'forbidden', detail: CROSS_ORIGIN, instance })
  }
  const client = await write.client()
  if (client === null) return problemResponse({ status: 401, ...write.refused, instance })
  const body = await documentBody(request, instance)
  if (!body.ok) return body.refusal
  try {
    const saved = await client.tabs.writeDocument(write.tab, body.document, request.headers.get('if-match') ?? '')
    return Response.json(saved, { status: 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return forwardedProblem(error, instance)
  }
}
