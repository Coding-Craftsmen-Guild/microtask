import type { SaveDocument, SaveOutcome } from '../editor/save-document'

/** The `fetch` a save calls, narrowed to what it passes; injectable so a test opens no socket. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>

const CONFLICT = 409

const REQUEST_TIMEOUT = 408

const TOO_MANY_REQUESTS = 429

const SERVER_ERROR = 500

const transient = (status: number): boolean =>
  status === REQUEST_TIMEOUT || status === TOO_MANY_REQUESTS || status >= SERVER_ERROR

const NO_STAMP = 'The save answered without the tab’s new version.'

/**
 * Where the admin surface writes one task's tab documents: the Route Handler, never the API.
 *
 * A root rather than a function, because the page that knows the task is a Server Component and
 * a function cannot cross into the client island. The client surface under `/s/*` passes this
 * root beneath its own token, because its credential is the token in that path (ADR 0040).
 */
export const adminDocumentRoot = (ref: { readonly projectId: string; readonly taskId: string }): string =>
  `/api/projects/${encodeURIComponent(ref.projectId)}/tasks/${encodeURIComponent(ref.taskId)}/tabs`

/** One tab's document, under a root from {@link adminDocumentRoot} or its client-surface twin. */
export const tabDocumentUrl = (root: string, tabId: string): string =>
  `${root}/${encodeURIComponent(tabId)}/document`

const record = async (response: Response): Promise<Readonly<Record<string, unknown>>> => {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const saved = async (response: Response): Promise<SaveOutcome> => {
  const stamp = (await record(response))['updatedAt']
  return typeof stamp === 'string' ? { kind: 'saved', updatedAt: stamp } : { kind: 'failed', message: NO_STAMP }
}

const unsaved = async (response: Response): Promise<SaveOutcome> => {
  const detail = (await record(response))['detail']
  const message =
    typeof detail === 'string' && detail !== '' ? detail : `The save failed (HTTP ${String(response.status)}).`
  return transient(response.status) ? { kind: 'failed', message } : { kind: 'refused', message }
}

/**
 * The `save` the editor island is given: one conditional `PUT` to the document route.
 *
 * The answer is read into the island's outcomes by status, and nothing is decided here beyond
 * that. A 409 is a `conflict`, which the island shows with a reload affordance and never
 * retries. A 408, a 429 and any 5xx are `failed`, which it retries every four seconds, because
 * the same write can land once the server recovers; a request that never arrived rejects, and the
 * island reads that as `failed` too. Every other refusal is `refused` — a 401 for a link that
 * was revoked or a session that lapsed, a 403 for a link downgraded to view, a 404, a 413 —
 * because sending the same write again earns the same answer, and a page left open would send it
 * every four seconds for as long as it stayed open (ADR 0016). Each carries the route's own
 * sentence, which is plain copy for the surface rather than the API's. A 401 is deliberately not
 * a redirect: the edit stays in the editor, where the user can copy it out or, having signed in
 * again in another browser tab, choose to retry.
 *
 * `keepalive` is passed through as the island decided it: only on `beforeunload`, and only for a
 * body it has already measured under the shared 64 KiB budget (ADR 0028).
 */
export function saveTabDocument(url: string, send: Fetch = (to, init) => fetch(to, init)): SaveDocument {
  return async ({ document, ifMatch, keepalive }) => {
    const response = await send(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': ifMatch },
      body: JSON.stringify(document),
      keepalive,
    })
    if (response.ok) return saved(response)
    return response.status === CONFLICT ? { kind: 'conflict' } : unsaved(response)
  }
}
