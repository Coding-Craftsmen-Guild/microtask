import { apiForSession } from '../../../../../../../../../lib/api'
import { DOCUMENT_REFUSALS } from '../../../../../../../../../lib/refusal'
import { putDocument } from '../../../../../../../../_document/put-document'

/** The path segments Next hands this handler, which the API validates in its turn. */
export interface DocumentRouteContext {
  /** Which tab is being written, named by the whole path down to it. */
  readonly params: Promise<{ projectId: string; taskId: string; tabId: string }>
}

/**
 * `PUT` one tab's document on the **admin** surface, which reads `mt_admin` and nothing else.
 *
 * `proxy.ts` passes `/api/*` through untouched, so authority is established in the handler, by
 * `putDocument`: a cross-site request is refused before the cookie is opened, and an unsigned-in
 * one before a byte of its body is read. A link visitor's save does not come here; it goes to the
 * twin under `/s/<token>/api/…`, whose credential is the token in its own path (ADR 0040).
 */
export async function PUT(request: Request, context: DocumentRouteContext): Promise<Response> {
  return putDocument(request, {
    instance: new URL(request.url).pathname,
    client: () => apiForSession('admin'),
    refusedCode: 'no_principal',
    copy: DOCUMENT_REFUSALS.admin,
    tab: await context.params,
  })
}
