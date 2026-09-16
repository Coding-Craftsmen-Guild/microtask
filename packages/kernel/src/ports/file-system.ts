/** The whole filesystem surface the store is allowed to use. */
export interface FileSystem {
  /** Reads a UTF-8 file, or returns null when it does not exist. */
  readText(file: string): Promise<string | null>

  /** Writes a UTF-8 file atomically, creating parent directories. */
  writeTextAtomic(file: string, text: string): Promise<void>

  /**
   * Reads a file's bytes, or returns null when it does not exist.
   *
   * Bytes rather than text because an upload arrives in chunks whose boundaries fall wherever
   * the transport put them: a chunk can end in the middle of a multi-byte UTF-8 character, and
   * decoding each chunk on its own substitutes U+FFFD at every such split. Reading the
   * reassembled file as bytes and decoding once is the only way a non-ASCII project name
   * survives a file large enough to chunk.
   */
  readBytes(file: string): Promise<Uint8Array | null>

  /**
   * Appends bytes to a file, creating it and its parent directories when absent.
   *
   * Appending bytes is the other half of the chunked upload: the caller hands over exactly what
   * it received, and no encode/decode round trip sits between one chunk and the next.
   */
  appendBytes(file: string, bytes: Uint8Array): Promise<void>

  /** Deletes a file, reporting whether it existed. */
  remove(file: string): Promise<boolean>

  /** Deletes a directory and everything under it, reporting whether it existed. */
  removeDir(dir: string): Promise<boolean>

  /** Lists immediate subdirectory names, or an empty array when absent. */
  listDirs(dir: string): Promise<readonly string[]>

  /** Lists immediate file names, or an empty array when absent. */
  listFiles(dir: string): Promise<readonly string[]>

  /**
   * Renames a file or directory onto an absent destination, creating the destination's parent
   * directories. Implementations rename rather than copy, so a directory arrives whole or not
   * at all — which is what lets a bulk import assemble a project elsewhere and publish it in
   * one step (ADR 0006).
   *
   * The destination must be absent. A rename onto an existing directory is not a merge and not
   * a replace: it fails, and the codes differ by platform, so no code is part of this contract.
   * Measured on win32 / Node 22.16 in this repo, `fs.renameSync` of a directory onto a
   * *non-empty* directory fails with `EPERM`, and onto an *empty* one with `EPERM` as well;
   * POSIX `rename(2)` specifies `ENOTEMPTY` or `EEXIST` for the non-empty case and succeeds for
   * the empty one. Only the non-empty case is guaranteed to fail on both, so callers must treat
   * any existing destination as a refusal rather than relying on either behaviour.
   *
   * @throws when the source does not exist, or the destination is a directory that is not empty.
   */
  move(from: string, to: string): Promise<void>
}
