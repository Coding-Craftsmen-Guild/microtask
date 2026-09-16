import type { HarvestedFile } from './vocabulary'

const SEPARATOR = '/'

/** The half of a `FileSystemDirectoryReader` a harvest reads. */
export interface HarvestReader {
  /** Yields the next batch of a directory's entries, and the empty array once exhausted. */
  readEntries: (
    onEntries: (entries: readonly HarvestEntry[]) => void,
    onError?: (error: unknown) => void,
  ) => void
}

/**
 * The half of a `FileSystemEntry` a harvest reads.
 *
 * Structural rather than lib.dom's `FileSystemEntry`, for the reason the doubles in the test
 * exist at all: happy-dom implements neither the entry nor its reader, so the only shape this
 * module can be exercised against is one it names itself. A real Chromium entry satisfies it.
 */
export interface HarvestEntry {
  /** Whether the entry is a file, which is the only thing a harvest can carry. */
  readonly isFile: boolean
  /** Whether the entry is a directory, whose members have to be pumped out of a reader. */
  readonly isDirectory: boolean
  /** The entry's path, relative to the drag root and carrying a single leading `/` by spec. */
  readonly fullPath: string
  /** Hands over a file entry's `File`, asynchronously. */
  readonly file?: (onFile: (file: File) => void, onError?: (error: unknown) => void) => void
  /** Opens a reader over a directory entry's members. */
  readonly createReader?: () => HarvestReader
}

/** The half of a `DataTransferItem` a harvest reads. */
export interface HarvestItem {
  /** The dropped entry, or null in a browser that does not implement the entries API. */
  readonly webkitGetAsEntry?: () => HarvestEntry | null
  /** The dropped file, which is all a browser without the entries API can offer. */
  readonly getAsFile?: () => File | null
}

/** The half of a `DataTransfer` a harvest reads. A real `DataTransfer` satisfies it. */
export interface HarvestTransfer {
  /** The dropped items, which are readable only while the drop event is dispatching. */
  readonly items: ArrayLike<HarvestItem>
  /** The dropped files, which likewise empty once dispatch ends. */
  readonly files: ArrayLike<File>
}

interface Seized {
  readonly entries: readonly HarvestEntry[]
  readonly files: readonly File[]
}

/**
 * Decodes the path one browser reported into the single encoding the server expects.
 *
 * This is the whole of the client's half of ADR 0018's normaliser, and the amendment of
 * 2026-09-12 records why it can be no more than this: `normaliseImportPath` is the server's
 * authority on what a path may be, `packages/ui` may not import it (ADR 0014), and a second
 * implementation of a *rejection* rule is the one kind of duplication that fails silently.
 *
 * So the two browser sources are reconciled and nothing else happens. A pick reports
 * `webkitRelativePath`, which is already relative. A drop reports `FileSystemEntry.fullPath`,
 * which is drag-root-relative and carries a single leading `/` by spec — passing that through
 * would have the server refuse **every** drop, since an absolute path is refused. Exactly one
 * separator is stripped, so `//volume/x` decodes to `/volume/x` and is still refused: a path
 * that is not what a browser produces stays refusable rather than being repaired into something
 * nobody dropped. A `..`, a backslash, a drive letter and a trailing separator likewise travel
 * untouched, and `a//b` and `a/./b` are left for the server to collapse.
 *
 * `reported` admits `undefined` because it is read off a `File`, and `webkitRelativePath` is
 * absent rather than empty in an environment that does not implement it (happy-dom 20.14.3, the
 * one these tests run in). Without that the path of a loose file would be the string
 * `"undefined"`, which is a file quietly harvested under the wrong name.
 *
 * @param reported - `File.webkitRelativePath` for a pick, `FileSystemEntry.fullPath` for a drop.
 * @param name - The file's own name, which is the path of a loose file that has no other.
 * @returns The path to send, still refusable by the server.
 */
export function harvestPath(reported: string | undefined, name: string): string {
  const source = reported === undefined || reported === '' ? name : reported
  return source.startsWith(SEPARATOR) ? source.slice(SEPARATOR.length) : source
}

const batchOf = (reader: HarvestReader) =>
  new Promise<readonly HarvestEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject)
  })

const fileOf = (entry: HarvestEntry) =>
  new Promise<File>((resolve, reject) => {
    if (entry.file === undefined) {
      reject(new Error(`the entry ${entry.fullPath} offers no file`))
      return
    }
    entry.file(resolve, reject)
  })

async function membersOf(directory: HarvestEntry): Promise<readonly HarvestEntry[]> {
  const reader = directory.createReader?.()
  if (reader === undefined) return []
  const members: HarvestEntry[] = []
  for (;;) {
    const batch = await batchOf(reader)
    if (batch.length === 0) return members
    members.push(...batch)
  }
}

async function walk(entry: HarvestEntry): Promise<readonly HarvestedFile[]> {
  if (entry.isDirectory) {
    const members = await membersOf(entry)
    const harvested = await Promise.all(members.map(walk))
    return harvested.flat()
  }
  const file = await fileOf(entry)
  return [{ path: harvestPath(entry.fullPath, file.name), file }]
}

function seize(transfer: HarvestTransfer): Seized {
  const entries: HarvestEntry[] = []
  const files: File[] = []
  for (const item of Array.from(transfer.items)) {
    const entry = item.webkitGetAsEntry?.() ?? null
    if (entry !== null) entries.push(entry)
    else {
      const file = item.getAsFile?.() ?? null
      if (file !== null) files.push(file)
    }
  }
  if (entries.length > 0 || files.length > 0) return { entries, files }
  return { entries, files: Array.from(transfer.files) }
}

async function gather(seized: Seized): Promise<readonly HarvestedFile[]> {
  const walked = await Promise.all(seized.entries.map(walk))
  return [...walked.flat(), ...harvestPick(seized.files)]
}

/**
 * Harvests a directory pick, or any other `FileList`, with the path each file was picked under.
 *
 * A file the browser reports no path for — every file of a plain `<input type="file">`, and any
 * file dropped by a browser without the entries API — is harvested under its own name and so
 * classifies individually, which is what ADR 0018 asks for a loose file.
 *
 * @param files - `input.files`, or null when the picker was cancelled.
 * @returns One harvested file per picked file, in the order the browser listed them.
 */
export function harvestPick(files: ArrayLike<File> | null): readonly HarvestedFile[] {
  if (files === null) return []
  return Array.from(files).map((file) => ({
    path: harvestPath(file.webkitRelativePath, file.name),
    file,
  }))
}

/**
 * Harvests a drop, reading the transfer **synchronously** and walking what it seized afterwards.
 *
 * Nothing is awaited before `transfer.items` is read, and that is the load-bearing property of
 * this function rather than a style: once the drop event's dispatch ends, the drag data store
 * returns to protected mode, `webkitGetAsEntry()` answers null and `.files` is empty (ADR 0018).
 * An `await` anywhere ahead of the read — including making this an `async` function that awaits
 * before touching `transfer` — silently harvests nothing from a real drop, which is why the
 * seizing is a separate synchronous step and the returned promise is built from its result.
 *
 * Each dropped directory is pumped through **one** reader until it yields the empty array,
 * because Chromium's `readEntries()` batches at 100 and a second reader restarts from entry 0 —
 * so both the single-call and the reader-per-batch implementations lose or repeat files.
 *
 * A file or directory that cannot be read rejects rather than resolving short: a drop that
 * reports fewer files than it contained is the failure ADR 0018 exists to prevent.
 *
 * @param transfer - The drop event's `dataTransfer`, while the event is still dispatching.
 * @returns Every file the drop carried, each under its decoded path.
 */
export function harvestDrop(transfer: HarvestTransfer): Promise<readonly HarvestedFile[]> {
  return gather(seize(transfer))
}
