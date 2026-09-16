import type { ChunkRef } from '@repo/api-client'
import { proxiedProblem, problemResponse } from '../../../_document/problem-response'
import { apiForSession } from '../../../../lib/api'
import { ACTION_REFUSALS } from '../../../../lib/refusal'
import { isSameOrigin } from '../../../_document/same-origin'

const CROSS_ORIGIN = 'An import upload is accepted only from a page this app served.'

const NOT_A_CHUNK =
  'An import chunk is addressed by its session, its harvested path and its byte offset.'

const DECIMAL = /^\d+$/

const chunkRefIn = (url: URL): ChunkRef | null => {
  const sessionId = url.searchParams.get('sessionId')
  const path = url.searchParams.get('path')
  const stated = url.searchParams.get('offset')
  if (sessionId === null || path === null || stated === null) return null
  if (!DECIMAL.test(stated)) return null
  const offset = Number(stated)
  if (!Number.isSafeInteger(offset)) return null
  return { sessionId, path, offset }
}

/**
 * `POST` one chunk of one harvested file into a staged import session.
 *
 * It is a route handler and not a Server Action for three measured reasons, all ADR 0015's: an
 * action's body is capped at 1 MB and a workspace bundle exceeds that immediately; Next dispatches
 * actions one at a time per client, so a per-file action could not be parallelised at all; and the
 * 1 MB cap is a per-app global, so raising it would loosen every action in the app for one
 * admin-only flow. `@repo/api-client`'s ordinary `Transport.json` could not carry it either — it
 * JSON-stringifies every body, and a `Uint8Array` stringifies to `{"0":1,…}`, which the API would
 * append to the staging file *in place of the bytes*, corrupting a file without failing a request.
 * The chunk goes through `Transport.bytes`, which sends the body verbatim (ADR 0044).
 *
 * **Authority is established here**, because `proxy.ts` passes `/api/*` through ungated. The
 * `Origin` check comes first, so a cross-site page cannot drive an import with an ambient cookie;
 * then `mt_admin`, whose absence — including a cookie that will not open, or one holding a link
 * principal — is a 401 before a byte of the body is read. Import creates projects, so it sits
 * above `manage`, the strongest thing a share link can hold, and the API gates every one of these
 * calls on `workspace:import` regardless (ADR 0009).
 *
 * The three coordinates are query parameters because a harvested path holds separators, and
 * `offset` is **required**: the browser tracks it per file and the API refuses a 409 naming the
 * offset to resume from when the two disagree, which is what stops a retried chunk being appended
 * twice.
 *
 * So the offset is matched against **decimal digits** and then bounded, rather than handed to
 * `Number` and checked afterwards, and the difference is the whole of this guard. `Number` reads
 * six shapes no browser produces as perfectly good integers, and every one of them was measured
 * reaching the API: `''` and `'  '` — an `?offset=` with nothing after it — become **0**, which is
 * the silently defaulted offset this parameter exists to make impossible; `'0x10'` becomes 16,
 * `'1e3'` becomes 1000, `'+5'` and `' 5 '` become 5. A digits-only match refuses all six as
 * unaddressable, and `Number.isSafeInteger` then refuses a run of digits too long to compare
 * exactly. Missing and malformed are both 422 before a byte of the body is read.
 *
 * What a **path** may be is still left to `normaliseImportPath`, the API's one authority on it,
 * rather than restated here where a second rejection rule would fail silently. The difference is
 * that the API has no authority to consult about an offset it was never sent.
 *
 * The refusal keeps the API's status and its `maxBytes` extension, so the browser can name the
 * cap a 413 hit rather than say "too large". One file's failure is reported as this file's
 * failure: the caller uploads each file independently and a rejection here does not end the
 * session.
 */
export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const instance = url.pathname
  if (!isSameOrigin(request.headers)) {
    return problemResponse({ status: 403, code: 'forbidden', detail: CROSS_ORIGIN, instance })
  }
  const api = await apiForSession('admin')
  if (api === null) {
    const detail = ACTION_REFUSALS.admin.unauthorised
    return problemResponse({ status: 401, code: 'no_principal', detail, instance })
  }
  const ref = chunkRefIn(url)
  if (ref === null) {
    return problemResponse({ status: 422, code: 'invalid', detail: NOT_A_CHUNK, instance })
  }
  try {
    const staged = await api.transfer.uploadChunk(ref, await request.arrayBuffer())
    return Response.json(staged, { status: 200, headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return proxiedProblem(error, instance, ACTION_REFUSALS.admin)
  }
}
