import { deflateRawSync } from 'node:zlib'

/**
 * One entry as it will appear in a test archive, with nothing inferred.
 *
 * Every field a fixture needs to lie about is explicit. `declaredSize` is the uncompressed size
 * written into both headers, which a bomb states truthfully and a malformed archive does not;
 * `attributes` is the 32-bit external-file-attributes field, whose top sixteen bits carry the unix
 * mode that marks a symbolic link; `method` is 0 stored or 8 deflated, and a stored entry is how a
 * fixture pins a compression ratio of exactly 1; and `flags` is the general-purpose bit field,
 * whose first bit marks an entry encrypted and whose twelfth says the name is UTF-8 — which every
 * builder below sets, because a name decoded as CP437 instead is a different name.
 */
export interface ArchiveEntry {
  readonly name: string
  readonly data: Uint8Array
  readonly method: number
  readonly attributes: number
  readonly declaredSize: number
  readonly flags: number
}

const STORED = 0
const DEFLATED = 8
const MODE_FILE = 0o100644
const MODE_LINK = 0o120777
const MODE_DIR = 0o40755
const MADE_BY_UNIX = 0x031e
const UTF8_NAMES = 0x800
const ENCODER = new TextEncoder()

const TABLE = ((): Int32Array => {
  const table = new Int32Array(256)
  for (let byte = 0; byte < 256; byte += 1) {
    let value = byte
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[byte] = value
  }
  return table
})()

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff
  for (let at = 0; at < bytes.length; at += 1) {
    value = (TABLE[(value ^ (bytes[at] ?? 0)) & 0xff] ?? 0) ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

const attributesFor = (mode: number): number => (mode << 16) >>> 0

interface Slab {
  readonly bytes: Uint8Array
  readonly u16: (at: number, value: number) => void
  readonly u32: (at: number, value: number) => void
}

const slab = (size: number): Slab => {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  return {
    bytes,
    u16: (at, value) => view.setUint16(at, value, true),
    u32: (at, value) => view.setUint32(at, value >>> 0, true),
  }
}

const concat = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    bytes.set(part, at)
    at += part.length
  }
  return bytes
}

const localHeader = (entry: ArchiveEntry, body: Uint8Array): Uint8Array => {
  const name = ENCODER.encode(entry.name)
  const out = slab(30 + name.length)
  out.u32(0, 0x04034b50)
  out.u16(4, 20)
  out.u16(6, entry.flags)
  out.u16(8, entry.method)
  out.u32(14, crc32(entry.data))
  out.u32(18, body.length)
  out.u32(22, entry.declaredSize)
  out.u16(26, name.length)
  out.bytes.set(name, 30)
  return out.bytes
}

const centralHeader = (entry: ArchiveEntry, body: Uint8Array, offset: number): Uint8Array => {
  const name = ENCODER.encode(entry.name)
  const out = slab(46 + name.length)
  out.u32(0, 0x02014b50)
  out.u16(4, MADE_BY_UNIX)
  out.u16(6, 20)
  out.u16(8, entry.flags)
  out.u16(10, entry.method)
  out.u32(16, crc32(entry.data))
  out.u32(20, body.length)
  out.u32(24, entry.declaredSize)
  out.u16(28, name.length)
  out.u32(38, entry.attributes)
  out.u32(42, offset)
  out.bytes.set(name, 46)
  return out.bytes
}

const endRecord = (count: number, listed: number, offset: number): Uint8Array => {
  const out = slab(22)
  out.u32(0, 0x06054b50)
  out.u16(8, count)
  out.u16(10, count)
  out.u32(12, listed)
  out.u32(16, offset)
  return out.bytes
}

/** A deflated file entry, which is what a zipper writes for anything compressible. */
export const deflated = (name: string, data: Uint8Array): ArchiveEntry => ({
  name,
  data,
  method: DEFLATED,
  attributes: attributesFor(MODE_FILE),
  declaredSize: data.length,
  flags: UTF8_NAMES,
})

/** A stored file entry, whose compression ratio is exactly 1 however large it is. */
export const stored = (name: string, data: Uint8Array): ArchiveEntry => ({
  name,
  data,
  method: STORED,
  attributes: attributesFor(MODE_FILE),
  declaredSize: data.length,
  flags: UTF8_NAMES,
})

/** A deflated entry of UTF-8 text, which is what every file in a real drop is. */
export const textFile = (name: string, text: string): ArchiveEntry =>
  deflated(name, ENCODER.encode(text))

/**
 * A symbolic-link entry: an ordinary entry whose content is the target path.
 *
 * What makes it a link is the unix mode in the external file attributes — `S_IFLNK`, `0o120000` —
 * and nothing about the name or the bytes. A reader that does not surface that field cannot tell
 * this from a short text file, which is why the library choice was decided on it.
 */
export const symlink = (name: string, target: string): ArchiveEntry => ({
  ...deflated(name, ENCODER.encode(target)),
  attributes: attributesFor(MODE_LINK),
})

/** A directory entry, which a zipper names with a trailing separator and no content. */
export const directory = (name: string): ArchiveEntry => ({
  name: name.endsWith('/') ? name : `${name}/`,
  data: new Uint8Array(0),
  method: STORED,
  attributes: (attributesFor(MODE_DIR) | 0x10) >>> 0,
  declaredSize: 0,
  flags: UTF8_NAMES,
})

/** An entry flagged as encrypted, which an import has no password to read. */
export const encrypted = (name: string, data: Uint8Array): ArchiveEntry => ({
  ...deflated(name, data),
  flags: UTF8_NAMES | 1,
})

/** An entry whose headers understate what it expands to, which a real archive never does. */
export const lying = (name: string, data: Uint8Array, declaredSize: number): ArchiveEntry => ({
  ...deflated(name, data),
  declaredSize,
})

/**
 * Assembles the bytes of a zip archive, entry for entry, with no repair and no inference.
 *
 * Hand-written because every fixture ADR 0020 asks for is an archive no zipper will produce: a
 * traversal in an entry name, a drive letter, a symbolic link, one name twice, an entry whose
 * declared size is a lie, and a compression ratio chosen to sit either side of a cap. A writing
 * library would refuse or silently correct most of them, and the ones it corrected would be
 * fixtures that no longer test anything.
 *
 * Every entry is stamped as made on unix, because that is what puts the mode bits in the external
 * attributes where a symbolic link can be read — a zip made on win32 cannot express one at all.
 * CRCs are real, so nothing here depends on the reader skipping them.
 */
export function zipArchive(entries: readonly ArchiveEntry[]): Uint8Array {
  const parts: Uint8Array[] = []
  const listed: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const body = entry.method === DEFLATED ? new Uint8Array(deflateRawSync(entry.data)) : entry.data
    const local = localHeader(entry, body)
    listed.push(centralHeader(entry, body, offset))
    parts.push(local, body)
    offset += local.length + body.length
  }
  const directory = concat(listed)
  return concat([...parts, directory, endRecord(entries.length, directory.length, offset)])
}

/** A zip of one flat map of text files, which is the archive form of a dropped folder. */
export const zipOfFiles = (files: Readonly<Record<string, string>>): Uint8Array =>
  zipArchive(Object.entries(files).map(([name, text]) => textFile(name, text)))
