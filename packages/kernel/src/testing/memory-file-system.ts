import type { FileSystem } from '../ports/file-system.js'

const normalise = (at: string): string => at.replace(/\\/g, '/').replace(/\/$/, '')

const under = (at: string): string => `${normalise(at)}/`

const fault = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code })

const joined = (existing: Uint8Array | undefined, bytes: Uint8Array): Uint8Array => {
  const at = existing?.length ?? 0
  const next = new Uint8Array(at + bytes.length)
  if (existing) next.set(existing, 0)
  next.set(bytes, at)
  return next
}

/**
 * A FileSystem holding bytes in memory, so a test never touches a disk.
 *
 * Every file is stored as bytes and every path is normalised to forward slashes, so the same
 * instance answers `C:\data\x` and `/data/x` the way the real adapter does on each platform.
 * `readText` and `writeTextAtomic` encode and decode around that byte store rather than keeping
 * a second string map, which is what makes the text and byte halves of the port agree here as
 * they do on a disk.
 *
 * Directories are implicit: they exist exactly as long as a file sits under them, because the
 * port has no way to create an empty one. That is a real difference from a disk, and it is why
 * `describeFileSystem`'s cases about empty directories are gated on a harness capability
 * instead of being written against this class.
 *
 * Errors carry a `code` for readability only. The real adapter's code for a move onto an
 * occupied destination differs by platform, so no case asserts one.
 */
export class MemoryFileSystem implements FileSystem {
  readonly #files = new Map<string, Uint8Array>()

  /** Discards every file, so each case in a suite starts from nothing. */
  clear(): void {
    this.#files.clear()
  }

  /** Reads a UTF-8 file, or returns null when it does not exist. */
  async readText(file: string): Promise<string | null> {
    const bytes = this.#files.get(normalise(file))
    return bytes === undefined ? null : new TextDecoder().decode(bytes)
  }

  /** Writes a UTF-8 file atomically, creating parent directories. */
  async writeTextAtomic(file: string, text: string): Promise<void> {
    this.#files.set(normalise(file), new TextEncoder().encode(text))
  }

  /** Reads a file's bytes, or returns null when it does not exist. */
  async readBytes(file: string): Promise<Uint8Array | null> {
    const bytes = this.#files.get(normalise(file))
    return bytes === undefined ? null : Uint8Array.from(bytes)
  }

  /** Appends bytes to a file, creating it and its parent directories when absent. */
  async appendBytes(file: string, bytes: Uint8Array): Promise<void> {
    const key = normalise(file)
    this.#files.set(key, joined(this.#files.get(key), bytes))
  }

  /** Deletes a file, reporting whether it existed. */
  async remove(file: string): Promise<boolean> {
    return this.#files.delete(normalise(file))
  }

  /** Deletes a directory and everything under it, reporting whether it existed. */
  async removeDir(dir: string): Promise<boolean> {
    const prefix = under(dir)
    const doomed = [...this.#files.keys()].filter((key) => key.startsWith(prefix))
    for (const key of doomed) this.#files.delete(key)
    return doomed.length > 0
  }

  /** Lists immediate subdirectory names, or an empty array when absent. */
  async listDirs(dir: string): Promise<readonly string[]> {
    return this.#names(dir, true)
  }

  /** Lists immediate file names, or an empty array when absent. */
  async listFiles(dir: string): Promise<readonly string[]> {
    return this.#names(dir, false)
  }

  /** Renames a file or directory onto an absent destination, whole or not at all. */
  async move(from: string, to: string): Promise<void> {
    const source = normalise(from)
    const target = normalise(to)
    const moving = this.#entriesUnder(source)
    if (moving.length === 0) {
      throw fault('ENOENT', `ENOENT: no such file or directory, rename '${source}'`)
    }
    if (this.#occupied(target)) {
      throw fault('ENOTEMPTY', `ENOTEMPTY: destination not empty, rename '${source}' -> '${target}'`)
    }
    for (const [key, bytes] of moving) {
      this.#files.delete(key)
      this.#files.set(target + key.slice(source.length), bytes)
    }
  }

  #names(dir: string, wantDirs: boolean): readonly string[] {
    const prefix = under(dir)
    const found = new Set<string>()
    for (const key of this.#files.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      const cut = rest.indexOf('/')
      if ((cut === -1) !== wantDirs) found.add(cut === -1 ? rest : rest.slice(0, cut))
    }
    return [...found]
  }

  #entriesUnder(at: string): readonly [string, Uint8Array][] {
    const exact = this.#files.get(at)
    if (exact !== undefined) return [[at, exact]]
    const prefix = `${at}/`
    return [...this.#files].filter(([key]) => key.startsWith(prefix))
  }

  #occupied(at: string): boolean {
    return this.#entriesUnder(at).length > 0
  }
}
