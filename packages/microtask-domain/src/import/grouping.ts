import { Conflict, Invalid } from '@repo/kernel'

/**
 * The manifest file name a v2 project directory is recognised by (ADR 0018).
 *
 * The same literal `storage/paths.ts` writes, restated here rather than imported because that
 * module's copy is a path **builder's** segment — it is joined onto a resolved root and guarded by
 * `contained()` — while this one is a name matched against text a drop chose. Sharing one constant
 * would mean this module importing the builder's, and that module imports `node:path`: nothing
 * here may, classification being pure so that it can run before anything touches disk (§7.3). What
 * makes the duplication safe is that the two would have to change together, and a test in
 * `grouping.test.ts` holds them to it.
 */
export const MANIFEST_FILE_NAME = 'project.json'

const TASKS_DIR_NAME = 'tasks'

const JSON_SUFFIX = '.json'

const SEPARATOR = '/'

const PARENT = '..'

const CURRENT = '.'

const DRIVE_LETTER = /^[A-Za-z]:/

const BLANK = 'An import path cannot be blank'

const HARVEST_ROOT = 'An import path cannot name the harvest root'

const CONTROL_CEILING = 0x20

const DELETE_POINT = 0x7f

const LONGEST_PATH = 1024

const LONGEST_SEGMENT_BYTES = 255

const ENCODER = new TextEncoder()

/** One harvested file: the relative path it was found at, and what its bytes parsed to. */
export interface ImportFile {
  readonly path: string
  readonly json: unknown
}

/**
 * One directory's worth of harvested files, in the roles ADR 0018 classifies a group by.
 *
 * `path` is the group's identity and the one field every group has: the directory for a project
 * directory, the file's own path for a loose self-describing file, and — for the orphan case ADR
 * 0018 names — the directory that is **missing** its manifest. It is what
 * `ImportPreviewGroup.path` renders, which is why an error row can still be told from another.
 *
 * `manifest` and `taskFiles` are the project-directory halves, and `file` is the loose one, so at
 * most one side of the record is populated. They are three fields rather than a discriminated
 * union because every consumer here reads one of them and a `kind` would be a second thing to keep
 * true: `manifest !== null` already *is* the discriminator ADR 0018 detects a v2 project directory
 * by, and `taskFiles` non-empty beside a null `manifest` already is the orphan. What a classified
 * group is read through downstream is `SniffedGroup`, which is a union on the shape sniffing
 * decided, so no consumer of a *classified* group re-tests these three.
 */
export interface ImportGroup {
  readonly path: string
  readonly manifest: ImportFile | null
  readonly taskFiles: readonly ImportFile[]
  readonly file: ImportFile | null
}

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

interface Bucket {
  readonly key: string
  readonly path: string
  manifest: ImportFile | null
  taskFiles: ImportFile[]
  file: ImportFile | null
}

type Role = 'manifest' | 'task' | 'file'

interface Placement {
  readonly role: Role
  readonly path: string
}

const directoryOf = (segments: readonly string[]): string =>
  segments.length === 0 ? CURRENT : segments.join(SEPARATOR)

function placementOf(path: string): Placement {
  const segments = path.split(SEPARATOR)
  const name = segments[segments.length - 1] ?? ''
  const parents = segments.slice(0, -1)
  if (name === MANIFEST_FILE_NAME) return { role: 'manifest', path: directoryOf(parents) }
  const inTasks = parents[parents.length - 1] === TASKS_DIR_NAME
  if (inTasks && name.endsWith(JSON_SUFFIX)) {
    return { role: 'task', path: directoryOf(parents.slice(0, -1)) }
  }
  return { role: 'file', path }
}

const keyOf = (placement: Placement): string =>
  `${placement.role === 'file' ? 'file' : 'dir'}:${placement.path}`

function bucketFor(buckets: Map<string, Bucket>, placement: Placement): Bucket {
  const key = keyOf(placement)
  const found = buckets.get(key)
  if (found !== undefined) return found
  const fresh: Bucket = { key, path: placement.path, manifest: null, taskFiles: [], file: null }
  buckets.set(key, fresh)
  return fresh
}

function fill(bucket: Bucket, role: Role, file: ImportFile): void {
  if (role === 'manifest') bucket.manifest = file
  else if (role === 'task') bucket.taskFiles.push(file)
  else bucket.file = file
}

const compare = (left: string, right: string): number => {
  if (left < right) return -1
  return left > right ? 1 : 0
}

const byPath = (left: ImportFile, right: ImportFile): number => compare(left.path, right.path)

const sealed = (bucket: Bucket): ImportGroup => ({
  path: bucket.path,
  manifest: bucket.manifest,
  taskFiles: [...bucket.taskFiles].sort(byPath),
  file: bucket.file,
})

/**
 * The normalised paths more than one harvested file claimed, each named once.
 *
 * The same question {@link groupImportFiles} has to answer with a throw, asked without one. A zip —
 * unlike a drop — can carry a duplicate entry name, and what Task 8 can do about that is per entry:
 * report the row, or refuse the upload with a reason naming the entry. Once a duplicate has reached
 * grouping there is no row left to report it in, so the throw there is a backstop and this is the
 * check a caller runs first.
 *
 * Every path goes through {@link normaliseImportPath} on the way, because two entry names that
 * differ only in a `.` segment or a repeated separator are one path: a caller comparing raw names
 * would miss exactly the collision this exists to find.
 *
 * @throws Invalid naming which rule a path broke.
 */
export function duplicatePaths(files: readonly ImportFile[]): readonly string[] {
  const seen = new Set<string>()
  const collided = new Set<string>()
  for (const harvested of files) {
    const path = normaliseImportPath(harvested.path)
    if (seen.has(path)) collided.add(path)
    seen.add(path)
  }
  return [...collided]
}

/**
 * Buckets harvested files by directory, so the four shapes are detected on a group (ADR 0018).
 *
 * Three placements, and the second is the whole point of the ADR: a `project.json` anchors a group
 * at **its own directory**, a `<dir>/tasks/*.json` joins the group at `<dir>` rather than forming
 * one of its own, and anything else becomes a group of one. Classifying per file instead is the bug
 * ADR 0018 was written about — the manifest imported, every task file "unrecognised", and a preview
 * that truthfully said "9 tasks" over nine documents that were dropped on the floor.
 *
 * A file that is neither is **not** folded into its directory's group, which is the one place this
 * departs from bucketing by directory alone. Such a file carries its own discriminator — it is a
 * bundle, a legacy project, or nothing this repo reads — so it needs no directory context, and
 * folding it in would give it no row of its own to be refused in. Silent skipping is the failure
 * mode ADR 0018 exists to close, so every harvested file lands in exactly one group and every group
 * gets a row.
 *
 * The result is **order-independent**, because both orders it could inherit are arbitrary: a
 * drop hands files over in the order the drag data store had them, and a `readdir` in whatever
 * order the filesystem answered. Groups come back sorted by an internal key that keeps a directory
 * group distinct from a loose file of the same name, and each group's `taskFiles` sorted by path.
 *
 * Two files harvested for one normalised path are refused rather than resolved last-wins: there is
 * no reading of that input under which one of them was the one meant. That refusal is a `Conflict`
 * and **not** the `Invalid` a hostile path gets, because the two ask for different remedies — dedupe
 * the archive or 422 the upload, against reject that one entry and keep the session — and a caller
 * that had to tell them apart by matching a message string would be reading prose to make a routing
 * decision. `ShareIndex.add` answers a token that already belongs elsewhere the same way.
 * {@link duplicatePaths} is how a caller asks the question before it becomes a refusal.
 *
 * @throws Invalid for a path {@link normaliseImportPath} refuses.
 * @throws Conflict for a path harvested twice, whose remedy is not a refused path's.
 */
export function groupImportFiles(files: readonly ImportFile[]): readonly ImportGroup[] {
  const [collided] = duplicatePaths(files)
  if (collided !== undefined) throw new Conflict(`Two files were harvested for "${collided}"`)
  const buckets = new Map<string, Bucket>()
  for (const harvested of files) {
    const path = normaliseImportPath(harvested.path)
    const placement = placementOf(path)
    fill(bucketFor(buckets, placement), placement.role, { path, json: harvested.json })
  }
  return [...buckets.values()].sort((left, right) => compare(left.key, right.key)).map(sealed)
}
