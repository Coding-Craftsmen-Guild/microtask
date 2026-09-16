import { Invalid } from '@repo/kernel'

/**
 * The one separator an import path uses, whatever the platform the drop came from.
 *
 * Exported so the modules that split and rejoin a normalised path share this module's spelling
 * rather than restating it. A backslash is refused outright rather than translated, so nothing
 * downstream has a second separator to consider.
 */
export const SEPARATOR = '/'

/**
 * The segment naming the directory a path is already in, which normalising drops.
 *
 * Exported for the one caller that has to *produce* it: a group harvested at the drag root has no
 * directory to name, and a bare `.` is what that reads as.
 */
export const CURRENT = '.'

const PARENT = '..'

const DRIVE_LETTER = /^[A-Za-z]:/

const BLANK = 'An import path cannot be blank'

const HARVEST_ROOT = 'An import path cannot name the harvest root'

const CONTROL_CEILING = 0x20

const DELETE_POINT = 0x7f

const LONGEST_PATH = 1024

const LONGEST_SEGMENT_BYTES = 255

const ENCODER = new TextEncoder()

interface PathRule {
  readonly broken: (value: string) => boolean
  readonly message: string
}

const controlPoint = (character: string): boolean => {
  const point = character.codePointAt(0) ?? 0
  return point < CONTROL_CEILING || point === DELETE_POINT
}

const carriesControl = (path: string): boolean => [...path].some(controlPoint)

const PATH_RULES: readonly PathRule[] = [
  { broken: (path) => path.trim() === '', message: BLANK },
  {
    broken: (path) => [...path].length > LONGEST_PATH,
    message: `An import path cannot be longer than ${LONGEST_PATH} characters`,
  },
  { broken: (path) => path.includes('\\'), message: 'An import path separates its segments with "/"' },
  { broken: (path) => DRIVE_LETTER.test(path), message: 'An import path cannot name a drive' },
  { broken: (path) => path.startsWith(SEPARATOR), message: 'An import path has to be relative' },
  {
    broken: (path) => path.endsWith(SEPARATOR),
    message: 'An import path names a file, not a directory',
  },
  { broken: carriesControl, message: 'An import path cannot carry a control character' },
]

const SEGMENT_RULES: readonly PathRule[] = [
  { broken: (segment) => segment === PARENT, message: 'An import path cannot step out with ".."' },
  {
    broken: (segment) => segment.trim() !== segment,
    message: 'An import path segment cannot begin or end with whitespace',
  },
  {
    broken: (segment) => segment.endsWith(CURRENT),
    message: 'An import path segment cannot end with "."',
  },
  {
    broken: (segment) => ENCODER.encode(segment).length > LONGEST_SEGMENT_BYTES,
    message: `An import path segment cannot be longer than ${LONGEST_SEGMENT_BYTES} bytes`,
  },
]

function refuse(rules: readonly PathRule[], value: string): void {
  for (const rule of rules) {
    if (rule.broken(value)) throw new Invalid(rule.message)
  }
}

/**
 * Puts one harvested path into the canonical relative form, refusing anything not already in it.
 *
 * This is the **server's** authority on what a path may be, and the only place one is refused (the
 * amendment to ADR 0018): the server re-runs it on whatever arrives, because a path that reached
 * the API was last touched by the client. `packages/ui`'s `harvest.ts` owns the other half, which
 * is *decoding* — a directory pick's `File.webkitRelativePath` beside a drop's
 * `FileSystemEntry.fullPath`, which is drag-root-relative and carries a single leading `/` by
 * spec. Stripping that prefix is decoding one source into the shared encoding, not a repair, so a
 * leading separator surviving into here can only come from something that is not a browser — a zip
 * entry name, or a body a caller wrote by hand.
 *
 * It sits in a **leaf** module of its own, importing nothing but `@repo/kernel`, because two
 * unrelated halves of this package need it: `import/grouping.ts`, which classifies, and
 * `storage/paths.ts`, which resolves a staged file's path and guards it with this the way it
 * guards an id segment with `isUlid`. Putting it in `grouping.ts` and having the path builders
 * import that would make every consumer of `paths.ts` — `FsProjectStore`, so effectively
 * everything — a consumer of the classifier. Nothing here may import `node:path` either, since
 * classification has to run before anything touches disk (§7.3).
 *
 * It **rejects rather than repairs** every form that could address a file the drop did not contain:
 * an absolute path, a `..` segment, a drive letter, and a backslash-separated or UNC path. A
 * sanitiser would have to choose what such a path meant, and every choice is a guess about a file
 * nobody dropped. What it does normalise is only what cannot change what a path names: a repeated
 * separator and a `.` segment collapse, since `a//b` and `a/./b` address `a/b` in every path system
 * there is. A **trailing** separator is refused instead of collapsed, because it does change what
 * the path names — it names a directory, which is what a zip carries its directory entries as, and
 * a group's members are files. A path that reduces to nothing at all — `.`, or a run of `.`
 * segments — names the harvest **root**, which is a directory too, and is told so rather than
 * called blank: blank is the empty string and a run of spaces.
 *
 * Three further forms are refused because the thing that would otherwise answer them is a
 * **filesystem**, and it answers as a 500 where this answers as a 422:
 *
 * - A **control character**. NUL is the sharp case: every `node:fs` call on a path carrying one
 *   throws `ERR_INVALID_ARG_VALUE`, so an entry name out of a zip's central directory carrying one
 *   is an unhandled error when staging writes it (Task 7) rather than a refusal an admin can read.
 *   The rest are legal on the container's filesystem and refused by win32, which is the same split
 *   the whitespace rule closes, and none of them can occur in a name this product wrote.
 * - A segment with **leading or trailing whitespace, or a trailing `.`**. Win32 strips both
 *   silently when it opens a name, so `a ` and `a` are two paths to this module and one file to
 *   that platform: they pass the collision check below and then overwrite each other. Win32 is
 *   supported, on the measurements ADR 0006 rests on, so this cannot be left to the platform.
 *   The rule is `trim()`, so it is wider than the ASCII space win32 strips: a trailing U+00A0 or
 *   U+3000, or a leading BOM, is refused too, and each of those is a legal name on ext4 and APFS.
 *   That breadth is deliberate. Refusing costs an operator one rename against a message naming the
 *   rule; admitting costs a silent overwrite on one platform, and this is the migration path for
 *   data that exists once. What it does **not** reach is the win32 **device** names — `CON`,
 *   `NUL`, `PRN`, `AUX`, `COM1`-`COM9`, `LPT1`-`LPT9` — which stay accepted, because their failure
 *   is a loud `open()` error on a developer's machine rather than a collision, and refusing
 *   `aux.json` outright would turn a file that imports cleanly in the container into one that
 *   cannot be imported at all.
 * - A **length** over a bound: 255 **bytes** per segment, 1024 characters for the whole path.
 *   255 is the component limit on both filesystems this repo writes to — bytes on ext4, UTF-16
 *   units on NTFS — so a longer segment is an `ENAMETOOLONG` waiting for the write path, and it is
 *   counted in bytes here because a 255-**character** bound admits a 765-byte CJK name that ext4
 *   then refuses. The whole-path bound is a bound against absurdity rather than a product limit: it
 *   sits far above the deepest path this product's own layout produces — a project directory's own
 *   is under 80 characters — and deliberately far above `ImportPreviewGroup.path`'s 200, because a
 *   longer path is expected there and eliding its middle for the row is the preview builder's job.
 *
 * The rules are a **list** rather than a chain of `if`s: the chain had reached the complexity cap
 * ADR 0027 sets at 10, and a rule in a list carries the message that names it, which is the one
 * property every rule is tested for — one refusal naming one rule, because the remedies differ.
 *
 * `raw` is `unknown` because it is read off a `DataTransfer`, a zip's central directory or a JSON
 * body, and a non-string there has to answer with the same `Invalid` as a hostile one rather than
 * a `TypeError` from the first method call.
 *
 * @throws Invalid naming which rule the path broke.
 */
export function normaliseImportPath(raw: unknown): string {
  if (typeof raw !== 'string') throw new Invalid(BLANK)
  refuse(PATH_RULES, raw)
  const segments = raw.split(SEPARATOR).filter((segment) => segment !== '' && segment !== CURRENT)
  if (segments.length === 0) throw new Invalid(HARVEST_ROOT)
  for (const segment of segments) refuse(SEGMENT_RULES, segment)
  return segments.join(SEPARATOR)
}

