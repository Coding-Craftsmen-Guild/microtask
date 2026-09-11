import { DocumentJson } from '@repo/contracts'
import { apiForSession } from '../../../../../../../../../lib/api'
import { forwardedProblem, problemResponse } from './problem-response'
import { isSameOrigin } from './same-origin'

/** The path segments Next hands this handler, which the API validates in its turn. */
export interface DocumentRouteContext {
  /** Which tab is being written, named by the whole path down to it. */
  readonly params: Promise<{ projectId: string; taskId: string; tabId: string }>
}

const CROSS_ORIGIN = 'A document write is accepted only from a page this app served.'

const NO_SESSION =
  'This browser is not signed in as the admin. Sign in again in another tab; this tab keeps its edits and saves on its next retry.'

const NOT_JSON = 'The request body is not JSON.'

const NOT_A_DOCUMENT = 'The request body is not a document.'

const jsonOf = async (request: Request): Promise<{ readonly value: unknown } | null> => {
  try {
    return { value: await request.json() }
  } catch {
    return null
  }
}

/**
 * `PUT` one tab's document: browser → this handler → API.
 *
 * It exists because nothing can dispatch a Server Action on unload, so the keepalive flush the
 * editor island sends on `beforeunload` needs a plain Route Handler (ADR 0015). It serves the
 * **admin** surface alone and reads `mt_admin` alone: ADR 0032 makes the two cookies disjoint by
 * route, so a link visitor's save needs a route of its own under `/s/*`.
 *
 * `proxy.ts` passes `/api/*` through untouched, so this establishes authority itself, in an
 * order where each step spends nothing the step before has not earned: the `Origin` check first,
 * then the session, then the body. A cross-site request is refused before a cookie is opened and
 * an unsigned-in one before a byte of its body is read.
 *
 * `If-Match` is forwarded **verbatim**; an absent one goes on as the empty string, and the API's
 * own validation answers it, so "is a precondition required" has one authority (ADR 0016). The
 * API's answer comes back unchanged in kind — see {@link forwardedProblem}.
 *
 * The document is checked against the same `DocumentJson` the API validates with, so a body that
 * is not a document is refused here with the same 422 rather than spent on a round trip.
 */
export async function PUT(request: Request, context: DocumentRouteContext): Promise<Response> {
  const instance = new URL(request.url).pathname
  if (!isSameOrigin(request.headers)) {
    return problemResponse({ status: 403, code: 'forbidden', detail: CROSS_ORIGIN, instance })
  }
  const client = await apiForSession('admin')
  if (client === null) {
    return problemResponse({ status: 401, code: 'no_principal', detail: NO_SESSION, instance })
  }
  const body = await jsonOf(request)
  if (body === null) return problemResponse({ status: 400, code: 'bad_request', detail: NOT_JSON, instance })
  const document = DocumentJson.safeParse(body.value)
  if (!document.success) {
    const errors = document.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }))
    return problemResponse({ status: 422, code: 'invalid', detail: NOT_A_DOCUMENT, instance }, { in: 'json', errors })
  }
  try {
    const ifMatch = request.headers.get('if-match') ?? ''
    const saved = await client.tabs.writeDocument(await context.params, document.data, ifMatch)
    return Response.json(saved, { status: 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return forwardedProblem(error, instance)
  }
}
