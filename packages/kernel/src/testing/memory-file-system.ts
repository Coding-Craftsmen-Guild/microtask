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
 * Every file is stored as bytes, and every path is folded to forward slashes and then compared
 * case-sensitively. That matches **neither** platform exactly, so keep a test's paths to one
 * spelling: win32's real adapter is case-*insensitive* — `Projects.json` written and
 * `projects.json` read gives the content back on disk and `null` here — and on POSIX a backslash
 * is a legal character in a filename, which this class folds into a separator. `readText` and
 * `writeTextAtomic` encode and decode around the one byte store rather than keeping a second
 * string map, which is what makes the text and byte halves of the port agree here as they do on
 * a disk.
 *
 * Wrong-kind paths throw here rather than answering the benign `null` or `[]` an in-memory map
 * falls into naturally, because a fake more forgiving than production lets a route pass its tests
 * and lose data on the volume. For the path *itself* that matches a disk on both platforms. For a
 * path whose **ancestor** is a file it matches the writes only: `mkdir` refuses on both, so
 * `writeTextAtomic` and `appendBytes` throw everywhere, but a bare `readFile`/`readdir` under a
 * file ancestor reports `ENOENT` on win32 — which the real adapter maps to absent — against
 * `ENOTDIR` on POSIX. The contract cannot pin what the two platforms disagree about, so this
 * class takes the stricter answer and throws; only the writes are asserted. Errors carry a `code`
 * for readability only, and no case asserts one.
 *
 * Directories are implicit: they exist exactly as long as a file sits under them. The port cannot
 * create an empty one, but its own operations *leave* them on a disk, and that is the direction
 * that bites — `move` out of a staging directory leaves the parent behind on a volume, where
 * `listDirs` still reports it and `removeDir` still answers `true`, while here it vanishes and
 * `removeDir` answers `false`. A sweep reading `false` as "already clean" is therefore right here
 * and wrong on disk. Fixing it needs a directory set this class does not keep, so the cases that
 * depend on an empty directory are gated on a harness capability instead.
 */
export class MemoryFileSystem implements FileSystem {
  readonly #files = new Map<string, Uint8Array>()

  /** Discards every file, so each case in a suite starts from nothing. */
  clear(): void {
    this.#files.clear()
  }

  /** Reads a UTF-8 file, or returns null when it does not exist. */
  async readText(file: string): Promise<string | null> {
    const bytes = this.#files.get(this.#asFile(file, 'read'))
    return bytes === undefined ? null : new TextDecoder().decode(bytes)
  }

  /** Writes a UTF-8 file atomically, creating parent directories. */
  async writeTextAtomic(file: string, text: string): Promise<void> {
    this.#files.set(this.#asFile(file, 'open'), new TextEncoder().encode(text))
  }

  /** Reads a file's bytes, or returns null when it does not exist. */
  async readBytes(file: string): Promise<Uint8Array | null> {
    const bytes = this.#files.get(this.#asFile(file, 'read'))
    return bytes === undefined ? null : Uint8Array.from(bytes)
  }

  /** Appends bytes to a file, creating it and its parent directories when absent. */
  async appendBytes(file: string, bytes: Uint8Array): Promise<void> {
    const key = this.#asFile(file, 'open')
    this.#files.set(key, joined(this.#files.get(key), bytes))
  }

  /** Deletes a file, reporting whether it existed. */
  async remove(file: string): Promise<boolean> {
    return this.#files.delete(this.#asFile(file, 'unlink'))
  }

  /** Removes whatever is at the path, of either kind, reporting whether it existed. */
  async removeDir(dir: string): Promise<boolean> {
    const at = normalise(dir)
    if (this.#files.delete(at)) return true
    const doomed = [...this.#files.keys()].filter((key) => key.startsWith(under(at)))
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
    if (this.#entriesUnder(target).length > 0) {
      throw fault('EEXIST', `EEXIST: destination exists, rename '${source}' -> '${target}'`)
    }
    for (const [key, bytes] of moving) {
      this.#files.delete(key)
      this.#files.set(target + key.slice(source.length), bytes)
    }
  }

  #asFile(file: string, syscall: string): string {
    const at = this.#belowNoFile(normalise(file), syscall)
    if (!this.#files.has(at) && this.#entriesUnder(at).length > 0) {
      throw fault('EISDIR', `EISDIR: illegal operation on a directory, ${syscall} '${at}'`)
    }
    return at
  }

  #asDir(dir: string): string {
    const at = this.#belowNoFile(normalise(dir), 'scandir')
    if (this.#files.has(at)) {
      throw fault('ENOTDIR', `ENOTDIR: not a directory, scandir '${at}'`)
    }
    return at
  }

  #belowNoFile(at: string, syscall: string): string {
    const parts = at.split('/')
    for (let cut = 1; cut < parts.length; cut += 1) {
      const ancestor = parts.slice(0, cut).join('/')
      if (this.#files.has(ancestor)) {
        throw fault('ENOTDIR', `ENOTDIR: not a directory, ${syscall} '${at}'`)
      }
    }
    return at
  }

  #names(dir: string, wantDirs: boolean): readonly string[] {
    const prefix = under(this.#asDir(dir))
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
}
