/**
 * The whole filesystem surface the store is allowed to use.
 *
 * **A path of the wrong kind is a fault, not an absence.** Every method below that names a single
 * path rejects when that path exists but is the other kind of node — a file where a directory was
 * named, or a directory where a file was. That is stated per method, and it is stated because the
 * benign alternative is what produces a false green: `null` from a read and `[]` from a listing
 * both mean *absent* everywhere else in this codebase, so an adapter answering either for a
 * wrong-kind path turns a staging mistake into "nothing is there" and the caller proceeds.
 *
 * Two methods sit outside that rule on purpose. {@link FileSystem.removeDir} removes whatever is
 * at the path, of either kind, because a bulk-import sweep wants `rm -rf` semantics on a staging
 * path that is a file before expansion and a directory after it. {@link FileSystem.move} takes a
 * source of either kind, since moving a directory whole is the reason it exists.
 *
 * The codes differ by platform and are no part of this contract. Measured on win32 / Node 22.16
 * in this repo: `readdir` on a file gives `ENOTDIR`, `readFile` and `appendFile` on a directory
 * give `EISDIR`, and `unlink` on a directory gives `EPERM` where Linux gives `EISDIR`. Callers
 * must treat any of them as a fault rather than switching on one.
 */
export interface FileSystem {
  /**
   * Reads a UTF-8 file, or returns null when it does not exist.
   *
   * @throws when the path exists and is a directory, which is not the same as absent.
   */
  readText(file: string): Promise<string | null>

  /**
   * Writes a UTF-8 file atomically, creating parent directories.
   *
   * @throws when the path exists and is a directory.
   */
  writeTextAtomic(file: string, text: string): Promise<void>

  /**
   * Reads a file's bytes, or returns null when it does not exist.
   *
   * Bytes rather than text because an upload arrives in chunks whose boundaries fall wherever
   * the transport put them: a chunk can end in the middle of a multi-byte UTF-8 character, and
   * decoding each chunk on its own substitutes U+FFFD at every such split. Reading the
   * reassembled file as bytes and decoding once is the only way a non-ASCII project name
   * survives a file large enough to chunk.
   *
   * The array handed back is the caller's own: mutating it changes nothing the next read sees.
   *
   * @throws when the path exists and is a directory, which is not the same as absent.
   */
  readBytes(file: string): Promise<Uint8Array | null>

  /**
   * Appends bytes to a file, creating it and its parent directories when absent.
   *
   * Appending bytes is the other half of the chunked upload: the caller hands over exactly what
   * it received, and no encode/decode round trip sits between one chunk and the next.
   *
   * @throws when the path exists and is a directory.
   */
  appendBytes(file: string, bytes: Uint8Array): Promise<void>

  /**
   * Deletes a file, reporting whether it existed.
   *
   * @throws when the path is a directory. Use {@link FileSystem.removeDir} for those; a caller
   * that does not know which it holds wants `removeDir`, which takes either.
   */
  remove(file: string): Promise<boolean>

  /**
   * Deletes a directory and everything under it, reporting whether it existed.
   *
   * Takes a file just as willingly, removing it and reporting true — the one method here that
   * does not care which kind of node it was given. A bulk import stages an upload as a file and
   * expands it into a directory at the same path, so its sweep must not have to know which stage
   * it interrupted.
   */
  removeDir(dir: string): Promise<boolean>

  /**
   * Lists immediate subdirectory names, or an empty array when absent.
   *
   * @throws when the path exists and is a file, which is not the same as absent.
   */
  listDirs(dir: string): Promise<readonly string[]>

  /**
   * Lists immediate file names, or an empty array when absent.
   *
   * @throws when the path exists and is a file, which is not the same as absent.
   */
  listFiles(dir: string): Promise<readonly string[]>

  /**
   * Renames a file or directory onto an absent destination, creating the destination's parent
   * directories. Implementations rename rather than copy, so a directory arrives whole or not
   * at all — which is what lets a bulk import assemble a project elsewhere and publish it in
   * one step (ADR 0006).
   *
   * The destination must be absent — of either kind — and an implementation enforces that itself
   * rather than leaving it to the platform, because left to the platform the answers diverge in
   * the dangerous direction. Measured on win32 / Node 22.16 in this repo, a bare `fs.rename` onto
   * an existing **file** succeeds and replaces it, and a directory source replaces that file with
   * the directory; onto a **non-empty directory** it fails with `EPERM`. So a caller using this
   * rejection as its "already published" guard would be refused by the live directory and would
   * silently destroy the live file. Both are refused here instead. Codes are no part of this
   * contract; `NodeFileSystem.move` records what the platform does underneath.
   *
   * @throws when the source does not exist, or anything at all exists at the destination.
   */
  move(from: string, to: string): Promise<void>
}
