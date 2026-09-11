import type { SaveDocument, SaveOutcome } from '../editor/save-document'

/** The `fetch` a save calls, narrowed to what it passes; injectable so a test opens no socket. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>

const CONFLICT = 409

const NO_STAMP = 'The save answered without the tab’s new version.'

/**
 * Where the admin surface writes one task's tab documents: the Route Handler, never the API.
 *
 * A root rather than a function, because the page that knows the task is a Server Component and
 * a function cannot cross into the client island; the client surface under `/s/*` passes a root
 * of its own (ADR 0032 keeps the two cookies on disjoint routes).
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

const failed = async (response: Response): Promise<SaveOutcome> => {
  const detail = (await record(response))['detail']
  const message =
    typeof detail === 'string' && detail !== '' ? detail : `The save failed (HTTP ${String(response.status)}).`
  return { kind: 'failed', message }
}

/**
 * The `save` the editor island is given: one conditional `PUT` to the document route.
 *
 * The answer is read into the island's three outcomes and nothing is decided here beyond that:
 * a 409 is a `conflict`, which the island shows with a reload affordance and never retries, and
 * every other refusal is a `failed` carrying the problem's own sentence, which it retries every
 * four seconds. A 401 is deliberately a failure and not a redirect — the edit stays in the editor,
 * and signing in again in another browser tab lets the next retry land it.
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
    return response.status === CONFLICT ? { kind: 'conflict' } : failed(response)
  }
}
