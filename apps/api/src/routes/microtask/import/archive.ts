import { Uint8ArrayReader, ZipReader, type Entry, type FileEntry } from '@zip.js/zip.js'
import { AppError, Invalid } from '@repo/kernel'
import { LONGEST_QUOTED_PATH, elideMiddle, normaliseImportPath } from '@repo/microtask-domain'

/**
 * The most entries one archive may carry.
 *
 * A project directory is one manifest plus one file per task, so ten thousand entries is around
 * two hundred and fifty projects at forty tasks each — three orders of magnitude above the volume
 * ADR 0044 measures at two files. What it bounds is the work an expansion commits to before it
 * has read a byte of content, and the session marker's own path list, which grows by one line per
 * entry staged.
 *
 * It is checked after the central directory is parsed, not before, and that is a stated limit
 * rather than an oversight: reading the entry count alone would mean this module parsing the
 * end-of-central-directory record itself, which is the zip-format knowledge the dependency exists
 * to own. The parse is bounded by the archive's own size — 46 bytes per entry at minimum, against
 * an upload the session cap holds to a hundred million — and the route is admin-only, which ADR
 * 0044 already records as the reason these caps are bounds against accident rather than defences
 * against a hostile principal.
 */
export const MAX_ARCHIVE_ENTRIES = 10_000

/**
 * The most **uncompressed** bytes one archive may expand to, across every entry.
 *
 * A fifth of `MAX_SESSION_BYTES`, so an archive and its expansion together can never fill a
 * session on their own, and the two caps can never be confused for one another: an archive alone
 * meets this one first, and the session cap answers only when a drop is staged beside it.
 *
 * Measured against what this product's own files weigh, building them from the fixtures in
 * `@repo/microtask-domain/testing`: a manifest carrying forty tasks is 8,118 bytes and a task file
 * carrying forty tabs of prose is 270,782 bytes, so this admits seventy such task files, against a
 * live volume ADR 0044 measures at 8,608 bytes in total. It does **not** admit the ~80 MB ceiling
 * that ADR computes for one pathological task file — forty tabs at `MAX_DOCUMENT_BYTES` each — and
 * that is the one thing it refuses that is not an attack. An operator who meets it drops the folder
 * instead, which is bounded by the session cap at five times this, and the refusal says so.
 */
export const MAX_ARCHIVE_BYTES = 20_000_000

/**
 * The most one entry may expand by, as a multiple of the bytes it occupies in the archive.
 *
 * The number that separates a bomb from data, and it is measured rather than guessed. With
 * `node:zlib` deflateRaw over this product's own shapes: a manifest carrying forty tasks
 * compresses 19:1, a task file of forty tabs of prose 150:1, and a 1.1 MB tab document of one
 * paragraph repeated twelve thousand times 287:1 — while a megabyte of one repeated character
 * reaches 1,014:1 and ten megabytes of zeros 1,028:1, against the 1,032:1 the deflate format
 * itself permits. A bomb has to live in the last few percent of that range to be worth building;
 * 500 sits above everything a file of ours measures at and below everything a bomb can do.
 * `archive.test.ts` re-measures each of those against this constant, so the claim fails a test
 * rather than ageing quietly.
 *
 * It is a per-entry rule, not an archive-wide one, because the average is what a bomb hides in: one
 * entry at 1,000:1 beside a hundred ordinary files averages out to nothing remarkable.
 */
export const MAX_ARCHIVE_RATIO = 500

/** The paths one expansion staged, and the uncompressed bytes they came to. */
export interface ArchiveExpansion {
  readonly paths: readonly string[]
  readonly bytes: number
}

/** Stages one expanded entry, whole, at the path it named. */
export type ArchiveStage = (path: string, bytes: Uint8Array) => Promise<void>

/** Refuses the whole set of entry paths before any of them is expanded. */
export type ArchiveCheck = (paths: readonly string[]) => void

interface Planned {
  readonly path: string
  readonly compressed: number
  readonly entry: FileEntry
}

const NOT_A_ZIP = 'This file is not a zip archive, or its central directory could not be read'

const quoted = (path: string): string => elideMiddle(path, LONGEST_QUOTED_PATH)

const refusal = (count: number): string =>
  `This archive holds ${String(count)} entries, over the ${String(MAX_ARCHIVE_ENTRIES)} one import may expand. Nothing was staged.`

const linked = (name: string): string =>
  `Entry "${quoted(name)}" is a symbolic link. An import stages files, and a link names a path outside what was dropped, so it is refused rather than followed.`

const locked = (name: string): string =>
  `Entry "${quoted(name)}" is encrypted, and an import has no password to read it with.`

const overRatio = (path: string, ratio: number): string =>
  `Entry "${quoted(path)}" expands at ${ratio.toFixed(1)}:1, over the compression ratio of ${String(MAX_ARCHIVE_RATIO)}:1 one entry may expand at. Nothing further was read from this archive.`

const overSize = (path: string, bytes: number): string =>
  `This archive expands to more than the ${String(MAX_ARCHIVE_BYTES)} bytes one import may expand, having reached ${String(bytes)} bytes at entry "${quoted(path)}". Unzip it and drop the folder instead, which is bounded by the session cap rather than by this one.`

const named = (raw: string): string => {
  try {
    return normaliseImportPath(raw)
  } catch (err) {
    if (!(err instanceof Invalid)) throw err
    throw new Invalid(`Entry "${quoted(raw)}" is refused. ${err.message}`)
  }
}

const ratioOf = (expanded: number, compressed: number): number =>
  expanded === 0 ? 0 : expanded / Math.max(compressed, 1)

function guard(one: Planned, expanded: number, total: number): void {
  const ratio = ratioOf(expanded, one.compressed)
  if (ratio > MAX_ARCHIVE_RATIO) throw new Invalid(overRatio(one.path, ratio))
  if (total > MAX_ARCHIVE_BYTES) throw new Invalid(overSize(one.path, total))
}

const unreadable = (err: unknown): Error =>
  err instanceof AppError ? err : new Invalid(NOT_A_ZIP)

const joined = (chunks: readonly Uint8Array[], size: number): Uint8Array => {
  const bytes = new Uint8Array(size)
  let at = 0
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }
  return bytes
}

async function listed(reader: ZipReader<unknown>): Promise<readonly Entry[]> {
  try {
    return await reader.getEntries({ filenameValidation: 'tolerant' })
  } catch (err) {
    throw unreadable(err)
  }
}

function plan(entries: readonly Entry[]): readonly Planned[] {
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Invalid(refusal(entries.length))
  const planned: Planned[] = []
  for (const entry of entries) {
    if (entry.directory) continue
    if (entry.symlink) throw new Invalid(linked(entry.filename))
    if (entry.encrypted) throw new Invalid(locked(entry.filename))
    planned.push({ path: named(entry.filename), compressed: entry.compressedSize, entry })
  }
  return planned
}

async function inflated(one: Planned, before: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  let seen = 0
  const writable = new WritableStream<Uint8Array>({
    write: (chunk) => {
      seen += chunk.length
      guard(one, seen, before + seen)
      chunks.push(chunk)
    },
  })
  try {
    await one.entry.getData({ writable })
  } catch (err) {
    throw unreadable(err)
  }
  return joined(chunks, seen)
}

async function expanded(planned: readonly Planned[], stage: ArchiveStage): Promise<ArchiveExpansion> {
  const paths: string[] = []
  let bytes = 0
  for (const one of planned) {
    const content = await inflated(one, bytes)
    bytes += content.length
    await stage(one.path, content)
    paths.push(one.path)
  }
  return { paths, bytes }
}

/**
 * Expands one zip archive into staging, enforcing every rule ADR 0020 names on the way.
 *
 * **The symlink rule is what chose the library.** A zip entry that is a symbolic link is an
 * ordinary file entry whose *content* is the target path; the only thing that says so is the unix
 * mode in its external file attributes, so a reader that does not surface that field cannot tell a
 * link from a short text file and "refused outright" is unimplementable on it. `fflate`'s `unzip`
 * surfaces a name, a size and the bytes, and nothing else — measured against its own types — so it
 * was out. `@zip.js/zip.js` was verified before it was chosen, on a hand-built archive: it exposes
 * `externalFileAttributes` and, better, a documented `symlink` flag decoded from it, which is what
 * `plan` reads; it gives `compressedSize` per entry and streams each one through a
 * `WritableStream`, so a cap can abort mid-entry; it has **no dependencies** and ships its own
 * types, where `yauzl` — the other reader that surfaces the attributes — brings two transitive
 * packages, a `@types/*` devDependency and a callback API. It needed no `configure()` call under
 * Node 22 ESM.
 *
 * Seven rules, in two phases, and the phase a rule is in is the whole of its guarantee.
 *
 * **Before a byte is staged**, from the central directory alone: the entry-count cap; a symbolic
 * link, refused outright and never followed; an encrypted entry, which has no password to read it
 * with; every entry name through `normaliseImportPath`, which is what refuses `..`, an absolute
 * path, a drive letter, a backslash-separated path and a control character — the server's one
 * authority on a path, restated nowhere; and `check`, which is how the caller refuses a set of
 * paths it cannot hold side by side. A hostile name in the *last* entry therefore refuses the
 * archive before the first entry is written, which is what makes "before anything is written"
 * a property rather than a hope.
 *
 * **While expanding**, per entry: the compression-ratio cap and the total uncompressed-size cap,
 * both measured over the bytes that actually arrive. The declared sizes in the archive's own
 * headers are *not* trusted for either — they are written by whoever built the archive, and the
 * library validates them against reality only after streaming a whole entry, which is exactly the
 * work these caps exist to avoid. So an entry is read in chunks, both caps are checked as each
 * chunk arrives, and the read is abandoned the moment one is breached. The ratio is checked first,
 * because it is the property that tells a bomb from a large archive, and a conventional bomb
 * breaches both at once.
 *
 * An entry is staged **whole or not at all**: its bytes are held until the entry has passed both
 * caps, so a refusal never leaves half a file for a preview to parse. Earlier entries that already
 * passed *stay* staged, and that is deliberate — rolling them back would make the "caps are
 * enforced while expanding" assertion untestable, since a refusal that cleans up looks identical
 * to one that expanded everything first and then refused. A session whose expansion was refused
 * therefore holds what was staged before the refusal, which is the same position a folder drop
 * interrupted halfway leaves it in, and the TTL sweep is what reclaims both.
 *
 * Memory is bounded by the caps rather than by the archive: one entry at a time, and no entry
 * survives past `MAX_ARCHIVE_BYTES`.
 *
 * Directory entries are **skipped**, not refused. A zip carries a directory as an entry whose
 * name ends in a separator, `normaliseImportPath` refuses a trailing separator by design, and
 * staging has no empty directories to create — so refusing them would refuse every archive a
 * real zipper writes.
 *
 * Anything **the library** fails on — a file that is not a zip, a compression method it does not
 * implement, a declared size that does not match the bytes, an archive two tools would read
 * differently — becomes one `Invalid`, so an unreadable upload is a 422 an operator can act on
 * rather than a 500. That translation wraps the two library calls and **nothing else**, which is
 * the difference between a 422 and a lie: a rejection from `stage` is the caller's, and a caller
 * that stages through the `FileSystem` port can fail with `ENOSPC` or `EACCES` — a full volume and
 * a permission fault, both of which the port's contract says are faults. Caught here they would
 * reach an operator as "this file is not a zip archive" and a 422 about an archive that was fine.
 * So they travel out untouched, as does an {@link AppError} from `check` or `stage`, which already
 * carries its own status. Measured: with the caller's collision check removed, a staged path of
 * the wrong kind reached this module as an `ENOTDIR` and an earlier draft reported it as an
 * unreadable archive.
 *
 * **The library's own filename guard is turned off deliberately.** `getEntries` defaults to
 * rejecting a `..` component, an absolute name and a drive letter itself, which is the same set
 * `normaliseImportPath` rejects and more besides — every one of those names carries a backslash, a
 * drive letter, a leading separator or a `..` segment, and that normaliser refuses all four. Left
 * on, it would be the thing that actually answered, and it answers with one opaque error naming no
 * rule: a traversal entry and a truncated archive would reach an operator as the same sentence,
 * and this module's own check would be dead code that every test still passed. So
 * `filenameValidation: 'tolerant'` hands every name to the one authority this codebase has for a
 * path, which is also the one the upload route answers with — the same refusal, the same wording,
 * whichever way a file arrived. Structural strictness is left at the library's default, which is
 * what refuses an ambiguous archive.
 *
 * @throws Invalid for any rule above, and for an archive the library cannot read.
 */
export async function expandArchive(
  archive: Uint8Array,
  check: ArchiveCheck,
  stage: ArchiveStage,
): Promise<ArchiveExpansion> {
  const reader = new ZipReader(new Uint8ArrayReader(archive))
  try {
    const planned = plan(await listed(reader))
    check(planned.map((one) => one.path))
    return await expanded(planned, stage)
  } finally {
    await reader.close().catch(() => undefined)
  }
}
