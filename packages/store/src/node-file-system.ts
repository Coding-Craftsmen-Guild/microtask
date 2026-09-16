import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileSystem } from '@repo/kernel'

const missing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

const present = async (at: string): Promise<boolean> => fs.lstat(at).then(() => true, () => false)

const occupied = (from: string, to: string): Error =>
  Object.assign(new Error(`EEXIST: destination exists, rename '${from}' -> '${to}'`), {
    code: 'EEXIST',
  })

const isDirectory = (at: string): Error =>
  Object.assign(new Error(`EISDIR: illegal operation on a directory, stat '${at}'`), {
    code: 'EISDIR',
  })

let sequence = 0

/** The only implementation of FileSystem that touches a real disk. */
export class NodeFileSystem implements FileSystem {
  /** Reads a UTF-8 file, or returns null when it does not exist. */
  async readText(file: string): Promise<string | null> {
    try {
      return await fs.readFile(file, 'utf8')
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  /** Writes a UTF-8 file atomically, creating parent directories. */
  async writeTextAtomic(file: string, text: string): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    sequence += 1
    const temp = `${file}.${process.pid}.${sequence}.tmp`
    try {
      await fs.writeFile(temp, text)
      await fs.rename(temp, file)
    } catch (error) {
      await fs.rm(temp, { force: true }).catch(() => undefined)
      throw error
    }
  }

  /** Reads a file's bytes, or returns null when it does not exist. */
  async readBytes(file: string): Promise<Uint8Array | null> {
    try {
      const buffer = await fs.readFile(file)
      return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    } catch (error) {
      if (missing(error)) return null
      throw error
    }
  }

  /** Appends bytes to a file, creating it and its parent directories when absent. */
  async appendBytes(file: string, bytes: Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.appendFile(file, bytes)
  }

  /** Deletes a file, reporting whether it existed. */
  async remove(file: string): Promise<boolean> {
    try {
      await fs.unlink(file)
      return true
    } catch (error) {
      if (missing(error)) return false
      throw error
    }
  }

  /**
   * How many bytes a file holds, or 0 when it does not exist.
   *
   * `stat().size`, so it is one syscall and no read: the file may be the 100 MB one import
   * session admits, and this is asked once per chunk from inside the process-wide write lock.
   *
   * A directory is refused explicitly, because `fs.stat` does **not** refuse one — it answers a
   * size. Measured on win32 / Node 22.16 in this repo: `statSync` on a directory succeeds with
   * `size: 0`, which is indistinguishable from the absent file this method answers 0 for and
   * would resume an upload at an offset into a file that does not exist.
   */
  async size(file: string): Promise<number> {
    try {
      const found = await fs.stat(file)
      if (found.isDirectory()) throw isDirectory(file)
      return found.size
    } catch (error) {
      if (missing(error)) return 0
      throw error
    }
  }

  /**
   * Removes whatever is at the path, of either kind, reporting whether it existed.
   *
   * `maxRetries` is passed because this is half of ADR 0006's bulk publish: clearing the
   * destination is what a project directory being moved into place waits on, and a directory
   * removal is a classic transient `EPERM`/`EBUSY` on win32 under a watcher or an anti-virus
   * scanner. Node's own retry covers exactly that set — its `fs.rm` documentation applies
   * `maxRetries` to `EBUSY`, `EMFILE`, `ENFILE`, `ENOTEMPTY` and `EPERM`, with a backoff it
   * manages itself — so the platform answers the one gap that could be closed without a timer
   * of this repo's own inside the write lock. `move`'s rename has no equivalent and stays
   * un-retried; `storage/publish.ts` states that decision where the publish is wired.
   */
  async removeDir(dir: string): Promise<boolean> {
    const existed = await fs.stat(dir).then(() => true, () => false)
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5 })
    return existed
  }

  /** Lists immediate subdirectory names, or an empty array when absent. */
  async listDirs(dir: string): Promise<readonly string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    } catch (error) {
      if (missing(error)) return []
      throw error
    }
  }

  /** Lists immediate file names, or an empty array when absent. */
  async listFiles(dir: string): Promise<readonly string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name)
    } catch (error) {
      if (missing(error)) return []
      throw error
    }
  }

  /**
   * Renames a file or directory onto an absent destination, creating its parent directories.
   *
   * The destination is probed rather than left to `fs.rename`, because `rename` enforces only
   * half of what the port promises. Measured on win32 / Node 22.16: onto an existing **file** it
   * succeeds and replaces it — a directory source replaces the file with the directory — while
   * onto a **non-empty directory** it fails with `EPERM`, and onto an **empty** one with `EPERM`
   * as well, where POSIX `rename(2)` specifies `ENOTEMPTY`/`EEXIST` for the non-empty case and
   * succeeds for the empty one. Only the non-empty-directory refusal holds on both platforms, so
   * without the probe a caller's "already published" guard destroys a live file.
   *
   * The probe makes this a check-then-act pair, and `lstat` is used so a symlink counts as
   * present. That is the same shape as `removeDir`'s stat-then-`rm`, and it is acceptable for the
   * same reason: every mutating service serialises on `QueueLock` (ADR 0030). Note the limit
   * honestly — that lock is per-process, which ADR 0030 already records as giving 19 lost updates
   * out of 20 across two replicas, and the platform's own refusal backstops only the
   * non-empty-directory case. A cross-replica race onto a destination *file* is therefore not
   * protected by anything here.
   *
   * There is no retry, and that is a known gap rather than a decision: a directory rename is a
   * classic transient `EPERM`/`EBUSY` source on win32 under a watcher or an anti-virus scanner,
   * this repo's win32 test harnesses already pass `maxRetries: 5` to their own cleanup, and a
   * bulk import's publish is the one call where a transient failure loses a whole project.
   * `removeDir` has the same gap. Whoever wires up the publish step should decide it there.
   */
  async move(from: string, to: string): Promise<void> {
    if (await present(to)) throw occupied(from, to)
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.rename(from, to)
  }
}
