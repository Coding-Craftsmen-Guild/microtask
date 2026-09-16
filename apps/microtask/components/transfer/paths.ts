import type { ChunkRef } from '@repo/api-client'

/** The admin surface's export/import page, which is the only page this feature has. */
export const TRANSFER_PAGE_PATH = '/transfer'

/**
 * The download address, which ADR 0015 names as one of exactly three route handlers this app has.
 *
 * It cannot be a Server Action: an action's return value is serialised into the Flight stream, so
 * it cannot answer a `Content-Disposition` response and cannot serve a file at all.
 */
export const EXPORT_ROUTE_PATH = '/api/export'

/**
 * Where one chunk of one harvested file is posted, the second of those three handlers.
 *
 * It cannot be an action either, and for a different reason: an action's request body is capped at
 * 1 MB, a workspace bundle exceeds that immediately, and Next dispatches actions one at a time per
 * client so a per-file action could not be parallelised at all (ADR 0015, ADR 0044).
 */
export const UPLOAD_ROUTE_PATH = '/api/import/upload'

/**
 * The download URL for a token disposition, or for none.
 *
 * `null` sends no parameter, which leaves the API's own default — `strip` — in force. The app
 * never spells that default: the API is the single authority on what a download carries, and a
 * copy of the default here is how a build that omits a warning ships a credential dump
 * (ADR 0017).
 */
export const exportUrl = (tokens: string | null): string =>
  tokens === null ? EXPORT_ROUTE_PATH : `${EXPORT_ROUTE_PATH}?tokens=${encodeURIComponent(tokens)}`

/**
 * The upload URL for one chunk: which session, which file, and where in that file it starts.
 *
 * All three are query parameters rather than path segments, because a harvested path holds
 * separators — `drop/<project>/tasks/<task>.json` is not one segment — which is the same shape the
 * API's own route takes for the same reason.
 */
export const uploadUrl = (ref: ChunkRef): string => {
  const query = new URLSearchParams({
    sessionId: ref.sessionId,
    path: ref.path,
    offset: String(ref.offset),
  })
  return `${UPLOAD_ROUTE_PATH}?${query.toString()}`
}
