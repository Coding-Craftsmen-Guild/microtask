import type { ChunkRef, Decoded } from '@repo/api-client'
import { ImportStagedChunk } from '@repo/contracts'
import { uploadUrl } from './paths'
import { RefusedUploadError, type RefusedUpload } from './refusal'

const OCTET_STREAM = 'application/octet-stream'

/** What one appended chunk added to a session, as the API reported it. */
export type StagedChunk = Decoded<typeof ImportStagedChunk>

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null

const refusalIn = (status: number, document: unknown): RefusedUpload => {
  const fields = isRecord(document) ? document : {}
  const code = fields['code']
  const cap = fields['maxBytes']
  return {
    status,
    code: typeof code === 'string' && code !== '' ? code : `http_${String(status)}`,
    maxBytes: typeof cap === 'number' && Number.isInteger(cap) && cap >= 0 ? cap : null,
  }
}

const refused = async (response: Response): Promise<RefusedUploadError> => {
  const document: unknown = await response.text().then(
    (raw) => {
      try {
        return JSON.parse(raw)
      } catch {
        return null
      }
    },
    () => null,
  )
  return new RefusedUploadError(refusalIn(response.status, document))
}

/**
 * Posts one chunk of one harvested file to this app's upload route, and answers what it staged.
 *
 * It goes to a route handler rather than a Server Action for the three reasons ADR 0015 records,
 * and the first is decisive on its own: an action's request body is capped at 1 MB and a
 * workspace bundle exceeds that immediately. The other two are why raising the cap would not
 * help — it is a per-app global, and Next dispatches actions one at a time per client, so an
 * import modelled as one action per file could not be parallelised at all.
 *
 * The body is the slice itself, declared `application/octet-stream`. Base64 in a JSON envelope
 * would be a third more bytes for the same payload and a decode step between the chunk and the
 * file it is appended to (ADR 0044).
 *
 * The success body is parsed through the **published** schema rather than trusted, which is what
 * makes `chunkBytes` a number the caller may compare its own slice against instead of whatever
 * arrived. A refusal is read field by field and each field falls back, because a proxy or a dead
 * process in between answers whatever it likes: the status is the one thing always available, and
 * `maxBytes` is dropped rather than guessed when it is not a whole number of bytes.
 *
 * @param ref - Which session, which file, and where in that file this chunk starts.
 * @param bytes - The slice, already cut to the session's `maxChunkBytes`.
 * @returns The path the server staged it at, and the byte counts it now holds.
 */
export async function postChunk(ref: ChunkRef, bytes: Blob): Promise<StagedChunk> {
  const response = await fetch(uploadUrl(ref), {
    method: 'POST',
    headers: { 'content-type': OCTET_STREAM },
    body: bytes,
  })
  if (!response.ok) throw await refused(response)
  return ImportStagedChunk.parse(await response.json())
}
