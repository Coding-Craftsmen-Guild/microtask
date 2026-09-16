import {
  ImportConfirmResult,
  ImportExpansion,
  ImportPreview,
  ImportSession,
  ImportStagedChunk,
} from '@repo/contracts'
import type { ImportProjectChoice } from '@repo/contracts'
import {
  IMPORT_SESSIONS_PATH,
  WORKSPACE_EXPORT_PATH,
  importSessionPath,
  projectExportPath,
} from '../paths.js'
import type { RawBody, Transport } from '../transport.js'
import type { Decoded } from '../types.js'

/**
 * Which file of which session a chunk belongs to, and where in that file it starts.
 *
 * `offset` is carried rather than inferred, because the route requires it and defaults nothing:
 * a client that let the server append "wherever the file ends" doubled a file's bytes when it
 * retried after a timeout, and the doubling showed up only as a session that hit its cap. So the
 * caller is the authority on where the next chunk goes, and the server refuses a 409 naming the
 * offset to resume from when the two disagree (ADR 0044).
 */
export interface ChunkRef {
  /** The session the chunk is staged into. */
  readonly sessionId: string

  /** The harvested path of the file this chunk belongs to, as the browser decoded it. */
  readonly path: string

  /** How many bytes of this file the caller believes are already staged. */
  readonly offset: number
}

/** A staged session and the conflict choices to apply it under, one per colliding project. */
export interface ImportConfirmation {
  /** The session that was previewed, named in the body as well as in the path. */
  readonly sessionId: string

  /** One choice per project the preview said the store already holds; sparse by design. */
  readonly choices: readonly Decoded<typeof ImportProjectChoice>[]
}

/**
 * Everything the import/export feature asks of the API: one download, and one staged session.
 *
 * Both halves are here rather than split in two, because they are one feature with one authority:
 * `workspace:import` for every import route and `workspace:list-projects` for the workspace
 * export. A caller holding a link token may call all of it and is refused by the API, which is
 * the same rule the surface states for every other operation group.
 */
export interface TransferApi {
  /**
   * Asks for a bundle of every project in this product, answering the response **unread**.
   *
   * A `Response` and not a decoded bundle, because the only caller is a Next route handler that
   * streams the body to a browser (ADR 0015, ADR 0041): parsing it here would buffer a whole
   * workspace in the app's process to produce a string it re-serialises on the way out, and a
   * `Content-Disposition` download cannot be served by a Server Action at all.
   *
   * `tokens` is forwarded **verbatim**, and `null` sends no parameter. The API's own `exportQuery`
   * defaults it to `strip` and refuses any value outside its enum, so neither this package nor
   * the app it serves re-decides what a download carries — a second default here is the way a
   * credential dump ships by accident (ADR 0017).
   */
  exportWorkspace(tokens: string | null): Promise<Response>

  /** The same bundle envelope for one project. `tokens` is forwarded verbatim, as above. */
  exportProject(projectId: string, tokens: string | null): Promise<Response>

  /** Opens a session and answers the id and the two byte caps every upload into it obeys. */
  openSession(): Promise<Decoded<typeof ImportSession>>

  /**
   * Appends one chunk of one file to a session, and answers the path the server staged it at.
   *
   * The answered `path` is the server's normalisation of the one sent, which is not always the
   * same spelling, so a caller addressing a later call by its own spelling would name a different
   * file. Chunks of one file go in sequence; the bounded concurrency is across files.
   */
  uploadChunk(ref: ChunkRef, chunk: RawBody): Promise<Decoded<typeof ImportStagedChunk>>

  /** Expands one already-staged `.zip` into the session and removes the archive (ADR 0020). */
  expandArchive(sessionId: string, path: string): Promise<Decoded<typeof ImportExpansion>>

  /** Describes what a confirm would do, group by group. It writes nothing. */
  preview(sessionId: string): Promise<Decoded<typeof ImportPreview>>

  /** Applies a staged session and answers what became of every project it held. */
  confirm(confirmation: ImportConfirmation): Promise<Decoded<typeof ImportConfirmResult>>
}

const disposition = (
  tokens: string | null,
): { readonly query?: Readonly<Record<string, string>> } =>
  tokens === null ? {} : { query: { tokens } }

/** Binds the transfer operations to a transport. */
export function transferApi(transport: Transport): TransferApi {
  return {
    exportWorkspace: (tokens) =>
      transport.stream({ method: 'GET', path: WORKSPACE_EXPORT_PATH, ...disposition(tokens) }),
    exportProject: (projectId, tokens) =>
      transport.stream({
        method: 'GET',
        path: projectExportPath(projectId),
        ...disposition(tokens),
      }),
    openSession: () =>
      transport.json({ method: 'POST', path: IMPORT_SESSIONS_PATH }, ImportSession),
    uploadChunk: (ref, chunk) =>
      transport.bytes(
        {
          method: 'POST',
          path: `${importSessionPath(ref.sessionId)}/files`,
          query: { path: ref.path, offset: String(ref.offset) },
          bytes: chunk,
        },
        ImportStagedChunk,
      ),
    expandArchive: (sessionId, path) =>
      transport.json(
        { method: 'POST', path: `${importSessionPath(sessionId)}/archives`, query: { path } },
        ImportExpansion,
      ),
    preview: (sessionId) =>
      transport.json(
        { method: 'GET', path: `${importSessionPath(sessionId)}/preview` },
        ImportPreview,
      ),
    confirm: (confirmation) =>
      transport.json(
        {
          method: 'POST',
          path: `${importSessionPath(confirmation.sessionId)}/confirm`,
          body: { sessionId: confirmation.sessionId, choices: confirmation.choices },
        },
        ImportConfirmResult,
      ),
  }
}
