/** The whole filesystem surface the store is allowed to use. */
export interface FileSystem {
  /** Reads a UTF-8 file, or returns null when it does not exist. */
  readText(file: string): Promise<string | null>

  /** Writes a UTF-8 file atomically, creating parent directories. */
  writeTextAtomic(file: string, text: string): Promise<void>

  /** Deletes a file, reporting whether it existed. */
  remove(file: string): Promise<boolean>

  /** Deletes a directory and everything under it, reporting whether it existed. */
  removeDir(dir: string): Promise<boolean>

  /** Lists immediate subdirectory names, or an empty array when absent. */
  listDirs(dir: string): Promise<readonly string[]>

  /** Lists immediate file names, or an empty array when absent. */
  listFiles(dir: string): Promise<readonly string[]>
}
