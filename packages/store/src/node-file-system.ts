import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileSystem } from '@repo/kernel'

const missing = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

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

  /** Removes whatever is at the path, of either kind, reporting whether it existed. */
  async removeDir(dir: string): Promise<boolean> {
    const existed = await fs.stat(dir).then(() => true, () => false)
    await fs.rm(dir, { recursive: true, force: true })
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

  /** Renames a file or directory onto an absent destination, creating its parent directories. */
  async move(from: string, to: string): Promise<void> {
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.rename(from, to)
  }
}
