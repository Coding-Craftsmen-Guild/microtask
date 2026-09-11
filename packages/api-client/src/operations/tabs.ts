import { Tab, TabDocumentSaved, TabList, type DocumentJson } from '@repo/contracts'
import { tabPath, taskPath } from '../paths.js'
import type { Transport } from '../transport.js'
import type { Decoded, TabRef, TaskRef } from '../types.js'

const tabsPath = (ref: TaskRef): string => `${taskPath(ref)}/tabs`

/** A Tiptap document, as the API stores and returns it. */
export type Document = Decoded<typeof DocumentJson>

/** Everything a caller may ask of a task's tabs. */
export interface TabsApi {
  /** Creates a tab at the end of the task's order, holding an empty document. */
  create(ref: TaskRef, name: string): Promise<Decoded<typeof Tab>>

  /** Renumbers every tab of this task into the order given, as a strict permutation. */
  reorder(ref: TaskRef, tabIds: readonly string[]): Promise<Decoded<typeof TabList>>

  /** Renames one tab, leaving its document and its position alone. */
  rename(ref: TabRef, name: string): Promise<Decoded<typeof Tab>>

  /** Removes one tab. The API refuses the last one a task has. */
  remove(ref: TabRef): Promise<void>

  /**
   * Replaces one tab's document, if it still carries the stamp the client last read.
   *
   * `expectedUpdatedAt` is the `updatedAt` the caller received with the tab, and it is sent as
   * `If-Match` rather than in the body: it is metadata about the request and not part of the
   * document being stored. A mismatch is `ApiError` with `status` 409, which means reload and
   * retry — a late write **should** lose (ADR 0016), and the keepalive flush a page sends as it
   * goes away is by construction the request most likely to land late.
   */
  writeDocument(
    ref: TabRef,
    document: Document,
    expectedUpdatedAt: string,
  ): Promise<Decoded<typeof TabDocumentSaved>>
}

/** Binds the tab operations to a transport. */
export function tabsApi(transport: Transport): TabsApi {
  return {
    create: (ref, name) =>
      transport.json({ method: 'POST', path: tabsPath(ref), body: { name } }, Tab),
    reorder: (ref, tabIds) =>
      transport.json(
        { method: 'POST', path: `${tabsPath(ref)}/reorder`, body: { tabIds } },
        TabList,
      ),
    rename: (ref, name) =>
      transport.json({ method: 'PATCH', path: tabPath(ref), body: { name } }, Tab),
    remove: (ref) => transport.empty({ method: 'DELETE', path: tabPath(ref) }),
    writeDocument: (ref, document, expectedUpdatedAt) =>
      transport.json(
        {
          method: 'PUT',
          path: `${tabPath(ref)}/document`,
          body: document,
          headers: { 'If-Match': expectedUpdatedAt },
        },
        TabDocumentSaved,
      ),
  }
}
