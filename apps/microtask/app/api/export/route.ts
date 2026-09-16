import { proxiedProblem, problemResponse } from '../../_document/problem-response'
import { apiForSession } from '../../../lib/api'
import { ACTION_REFUSALS } from '../../../lib/refusal'
import { exportFilename } from './filename'

const TOKENS = 'tokens'

const JSON_MEDIA_TYPE = 'application/json'

const attachment = (upstream: Response, filename: string): Response =>
  new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? JSON_MEDIA_TYPE,
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  })

/**
 * `GET` a bundle of the whole workspace, as a file the browser saves.
 *
 * It exists because neither half of this can be done any other way. The API is internal-only —
 * no published port, no domain, unreachable from any browser (ADR 0041) — so the bytes have to
 * come through this app; and an action's return value is serialised into the Flight stream, so a
 * Server Action cannot answer a `Content-Disposition` response at all. ADR 0015 names
 * `GET /api/export/…` as one of exactly three route handlers this app has for that reason.
 *
 * **Authority is established here, not upstream.** `proxy.ts` passes `/api/*` through *ungated* —
 * deliberately, because a proxy that redirected an API call to `/login` would answer a fetch with
 * an HTML page — so this reads `mt_admin` itself and answers 401 when it is absent. "Absent"
 * includes a cookie that will not open and one holding a **link** principal: `adminFrom` checks
 * `kind`, so a share token moved into `mt_admin` builds no admin client and reaches no API call.
 * A link holder therefore gets 401 and not one byte, which is the point — a workspace bundle is
 * every project in the product, and `?tokens=preserve` makes it every live credential too.
 *
 * `?tokens=` is forwarded **unchanged**, absent included. The API's `exportQuery` defaults it to
 * `strip` and refuses anything outside its enum, so a value this app does not recognise travels
 * on and meets its 422 there rather than being repaired into one of the two — the whole point of
 * one authority on a rule whose two answers are "a copy of the data" and "a credential dump"
 * (ADR 0017). Every other parameter is dropped, so nothing else can be smuggled onto the call.
 *
 * The body is **streamed**: `upstream.body` is handed to the new `Response` untouched, and
 * nothing on this path reads it. Buffering it would hold a whole workspace in this process to
 * produce a string it re-serialises on the way out — and `Transport.json`, which every other
 * operation in the app goes through, would do exactly that, which is why the export goes through
 * `Transport.stream` instead.
 *
 * A refusal keeps the API's status, because the browser and the operator act on them differently
 * — a 409 is a task file that will not read, a 403 is a credential the API refused — and never
 * keeps the API's sentence. An unreachable API is a 503 and never a 200 with an empty file.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const instance = url.pathname
  const api = await apiForSession('admin')
  if (api === null) {
    const detail = ACTION_REFUSALS.admin.unauthorised
    return problemResponse({ status: 401, code: 'no_principal', detail, instance })
  }
  try {
    const upstream = await api.transfer.exportWorkspace(url.searchParams.get(TOKENS))
    return attachment(upstream, exportFilename(new Date()))
  } catch (error) {
    return proxiedProblem(error, instance, ACTION_REFUSALS.admin)
  }
}
