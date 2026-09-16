import { describe, expect, it } from 'vitest'
import type { FileSystem } from '../ports/file-system.js'

const NAME = 'Ärendehantering 日本語 — år 2026'

const REPLACEMENT = String.fromCharCode(0xfffd)

const encode = (text: string): Uint8Array => new TextEncoder().encode(text)

const decode = (bytes: Uint8Array | null): string =>
  new TextDecoder().decode(bytes ?? new Uint8Array())

const at = (dir: string, ...parts: string[]): string => [dir, ...parts].join('/')

const sorted = (names: readonly string[]): string[] => [...names].sort()

/** The adapter under test, plus whatever setup that adapter can offer the contract. */
export interface FileSystemHarness {
  /** The adapter every case below runs against. */
  files: FileSystem

  /**
   * Discards everything written so far and hands back an empty directory to work in. Returned
   * rather than fixed so the real adapter can give each case its own temporary directory, which
   * is what stops two cases in one run from colliding on a shared disk.
   */
  reset(): Promise<string>

  /**
   * Creates `dir` holding nothing, so the contract can prove listings and removal handle a
   * directory with no files under it. Optional: an adapter whose directories exist only as the
   * prefixes of the files in them has no way to make one, and skipping the case is preferable
   * to widening FileSystem with a `makeDir` the application would never call — nothing in this
   * codebase creates a directory except as a side effect of writing a file into it.
   */
  makeEmptyDir?(dir: string): Promise<void>
}

/** How long one case may take, raised for an adapter doing real IO on a contended disk. */
export interface FileSystemContractOptions {
  /** Per-case timeout in milliseconds, passed straight to vitest's `describe`. */
  timeout?: number
}

/**
 * Runs the behaviour every FileSystem adapter must exhibit.
 *
 * It exists because the import routes are written against a fake and run against a disk, and the
 * four ways those two can disagree all decide what an import does: a `move` that copies instead
 * of renaming, an `appendBytes` that creates parent directories where the other throws, a
 * `listFiles` that includes directory names, and a `readBytes` answering an empty array rather
 * than null for a file that is not there. Each of those passes a test written against one
 * implementation alone, so the contract is written once and run by both.
 */
export function describeFileSystem(
  name: string,
  makeHarness: () => FileSystemHarness,
  options: FileSystemContractOptions = {},
): void {
  describe(`${name} — FileSystem contract`, options, () => {
    const harness = makeHarness()
    const { files } = harness

    const fresh = async () => harness.reset()

    const staged = async (dir: string) => {
      const target = at(dir, 'staged')
      await files.writeTextAtomic(at(target, 'inside.json'), 'kept')
      return target
    }

    const intact = async (target: string) => {
      expect(await files.readText(at(target, 'inside.json'))).toBe('kept')
    }

    it('returns null for text that was never written', async () => {
      const dir = await fresh()
      expect(await files.readText(at(dir, 'absent.json'))).toBeNull()
    })

    it('round-trips text through parent directories that did not exist', async () => {
      const dir = await fresh()
      const file = at(dir, 'deep', 'deeper', 'project.json')
      await files.writeTextAtomic(file, NAME)
      expect(await files.readText(file)).toBe(NAME)
    })

    it('replaces a file whole on a second write, rather than appending to it', async () => {
      const dir = await fresh()
      const file = at(dir, 'project.json')
      await files.writeTextAtomic(file, 'first and longer')
      await files.writeTextAtomic(file, 'second')
      expect(await files.readText(file)).toBe('second')
    })

    it('reports a file it deleted as having existed, and it is then gone', async () => {
      const dir = await fresh()
      const file = at(dir, 'project.json')
      await files.writeTextAtomic(file, '{}')
      expect(await files.remove(file)).toBe(true)
      expect(await files.readText(file)).toBeNull()
    })

    it('reports a file that was never there as not removed', async () => {
      const dir = await fresh()
      expect(await files.remove(at(dir, 'absent.json'))).toBe(false)
    })

    it('rejects a read of a path that is a directory, since a wrong kind is a fault and not an absence', async () => {
      const dir = await fresh()
      const target = await staged(dir)
      await expect(files.readText(target)).rejects.toThrow()
      await expect(files.readBytes(target)).rejects.toThrow()
      await intact(target)
    })

    it('rejects a write to a path that is a directory, leaving what is under it', async () => {
      const dir = await fresh()
      const target = await staged(dir)
      await expect(files.writeTextAtomic(target, 'clobbered')).rejects.toThrow()
      await expect(files.appendBytes(target, encode('clobbered'))).rejects.toThrow()
      await intact(target)
    })

    it('rejects removing a directory as a file, leaving what is under it', async () => {
      const dir = await fresh()
      const target = await staged(dir)
      await expect(files.remove(target)).rejects.toThrow()
      await intact(target)
    })

    it('rejects listing a path that is a file, since a wrong kind is a fault and not an absence', async () => {
      const dir = await fresh()
      const file = at(dir, 'upload.zip')
      await files.writeTextAtomic(file, 'staged')
      await expect(files.listDirs(file)).rejects.toThrow()
      await expect(files.listFiles(file)).rejects.toThrow()
      expect(await files.readText(file)).toBe('staged')
    })

    it('removes a file handed to removeDir, so a sweep need not know which stage it interrupted', async () => {
      const dir = await fresh()
      const file = at(dir, 'session')
      await files.writeTextAtomic(file, 'an upload not yet expanded')
      expect(await files.removeDir(file)).toBe(true)
      expect(await files.readText(file)).toBeNull()
    })

    it('removes a directory and everything nested under it, reporting it existed', async () => {
      const dir = await fresh()
      const project = at(dir, 'project')
      await files.writeTextAtomic(at(project, 'project.json'), '{}')
      await files.writeTextAtomic(at(project, 'tasks', 'one.json'), '{}')
      expect(await files.removeDir(project)).toBe(true)
      expect(await files.readText(at(project, 'project.json'))).toBeNull()
      expect(await files.readText(at(project, 'tasks', 'one.json'))).toBeNull()
    })

    it('reports a directory that was never there as not removed', async () => {
      const dir = await fresh()
      expect(await files.removeDir(at(dir, 'absent'))).toBe(false)
    })

    it('lists no subdirectories for a directory that is not there', async () => {
      const dir = await fresh()
      expect(await files.listDirs(at(dir, 'absent'))).toEqual([])
    })

    it('lists immediate subdirectory names only, leaving out files and nested directories', async () => {
      const dir = await fresh()
      await files.writeTextAtomic(at(dir, 'loose.json'), '{}')
      await files.writeTextAtomic(at(dir, 'one', 'project.json'), '{}')
      await files.writeTextAtomic(at(dir, 'two', 'tasks', 'a.json'), '{}')
      expect(sorted(await files.listDirs(dir))).toEqual(['one', 'two'])
    })

    it('answers the same for a directory named with a trailing separator as without one', async () => {
      const dir = await fresh()
      await files.writeTextAtomic(at(dir, 'one', 'project.json'), '{}')
      await files.writeTextAtomic(at(dir, 'loose.json'), '{}')
      expect(await files.listDirs(`${dir}/`)).toEqual(['one'])
      expect(await files.listFiles(`${dir}/`)).toEqual(['loose.json'])
    })

    it('answers null, not an empty array, for bytes of a file that is not there', async () => {
      const dir = await fresh()
      expect(await files.readBytes(at(dir, 'absent.bin'))).toBeNull()
    })

    it('answers an empty array for a file that exists and holds nothing, so absent and empty stay apart', async () => {
      const dir = await fresh()
      const file = at(dir, 'empty.bin')
      await files.appendBytes(file, new Uint8Array())
      const bytes = await files.readBytes(file)
      expect(bytes).not.toBeNull()
      expect(bytes?.length).toBe(0)
    })

    it('reads back as bytes what was written as text, so the two halves of the port agree', async () => {
      const dir = await fresh()
      const file = at(dir, 'project.json')
      await files.writeTextAtomic(file, NAME)
      expect([...((await files.readBytes(file)) ?? [])]).toEqual([...encode(NAME)])
    })

    it('hands back bytes the caller owns, so mutating them cannot reach back into the store', async () => {
      const dir = await fresh()
      const file = at(dir, 'upload.zip')
      await files.appendBytes(file, encode('payload'))
      const handed = await files.readBytes(file)
      expect(handed).not.toBeNull()
      handed?.fill(0)
      expect([...((await files.readBytes(file)) ?? [])]).toEqual([...encode('payload')])
    })

    it('appends bytes into parent directories that did not exist', async () => {
      const dir = await fresh()
      const file = at(dir, 'import', 'session', 'upload.zip')
      await files.appendBytes(file, encode('chunk'))
      expect(await files.readText(file)).toBe('chunk')
    })

    it('appends in call order, so a third chunk lands after the second', async () => {
      const dir = await fresh()
      const file = at(dir, 'upload.zip')
      await files.appendBytes(file, encode('one'))
      await files.appendBytes(file, encode('two'))
      await files.appendBytes(file, encode('three'))
      expect(await files.readText(file)).toBe('onetwothree')
    })

    it('reassembles a two-chunk upload split in the middle of a multi-byte character without substituting U+FFFD', async () => {
      const dir = await fresh()
      const whole = encode(NAME)
      const mid = whole.findIndex((byte, index) => index > 0 && (byte & 0xc0) === 0x80)
      expect(mid).toBeGreaterThan(0)
      expect(decode(whole.subarray(0, mid))).toContain(REPLACEMENT)

      const file = at(dir, 'import', 'session', 'upload.zip')
      await files.appendBytes(file, whole.subarray(0, mid))
      await files.appendBytes(file, whole.subarray(mid))

      const read = await files.readBytes(file)
      expect(read).not.toBeNull()
      expect([...(read ?? [])]).toEqual([...whole])
      expect(decode(read)).toBe(NAME)
      expect(await files.readText(file)).toBe(NAME)
    })

    it('lists no files for a directory that is not there', async () => {
      const dir = await fresh()
      expect(await files.listFiles(at(dir, 'absent'))).toEqual([])
    })

    it('lists immediate file names only, leaving out subdirectory names and nested files', async () => {
      const dir = await fresh()
      await files.writeTextAtomic(at(dir, 'project.json'), '{}')
      await files.writeTextAtomic(at(dir, 'marker.json'), '{}')
      await files.writeTextAtomic(at(dir, 'tasks', 'one.json'), '{}')
      expect(sorted(await files.listFiles(dir))).toEqual(['marker.json', 'project.json'])
      expect(sorted(await files.listDirs(dir))).toEqual(['tasks'])
    })

    it('moves a file onto an absent destination, leaving nothing behind', async () => {
      const dir = await fresh()
      const from = at(dir, 'build', 'project.json')
      const to = at(dir, 'projects', 'project.json')
      await files.writeTextAtomic(from, NAME)
      await files.move(from, to)
      expect(await files.readText(to)).toBe(NAME)
      expect(await files.readText(from)).toBeNull()
    })

    it('moves a directory whole, nested files included, creating the destination parent', async () => {
      const dir = await fresh()
      const from = at(dir, 'build', 'project')
      const to = at(dir, 'published', 'project')
      await files.writeTextAtomic(at(from, 'project.json'), NAME)
      await files.writeTextAtomic(at(from, 'tasks', 'one.json'), '{"id":1}')
      await files.move(from, to)
      expect(await files.readText(at(to, 'project.json'))).toBe(NAME)
      expect(await files.readText(at(to, 'tasks', 'one.json'))).toBe('{"id":1}')
      expect(await files.listFiles(from)).toEqual([])
      expect(await files.listDirs(from)).toEqual([])
    })

    it('refuses a destination directory that is not empty, leaving both sides exactly as they were', async () => {
      const dir = await fresh()
      const from = at(dir, 'build', 'project')
      const to = at(dir, 'projects', 'project')
      await files.writeTextAtomic(at(from, 'project.json'), 'incoming')
      await files.writeTextAtomic(at(to, 'project.json'), 'live')
      await expect(files.move(from, to)).rejects.toThrow()
      expect(await files.readText(at(to, 'project.json'))).toBe('live')
      expect(await files.readText(at(from, 'project.json'))).toBe('incoming')
    })

    it('rejects a move whose source does not exist', async () => {
      const dir = await fresh()
      await expect(files.move(at(dir, 'absent'), at(dir, 'projects', 'x'))).rejects.toThrow()
    })

    it.skipIf(!harness.makeEmptyDir)(
      'counts a directory holding no files as a subdirectory that exists, with no files in it',
      async () => {
        const dir = await fresh()
        await harness.makeEmptyDir?.(at(dir, 'session'))
        expect(await files.listDirs(dir)).toEqual(['session'])
        expect(await files.listFiles(at(dir, 'session'))).toEqual([])
      },
    )

    it.skipIf(!harness.makeEmptyDir)(
      'reports a directory holding no files as having existed when it is removed',
      async () => {
        const dir = await fresh()
        await harness.makeEmptyDir?.(at(dir, 'session'))
        expect(await files.removeDir(at(dir, 'session'))).toBe(true)
        expect(await files.listDirs(dir)).toEqual([])
      },
    )
  })
}
