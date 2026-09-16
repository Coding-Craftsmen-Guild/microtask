import { Conflict } from '@repo/kernel'
import { CURRENT, SEPARATOR, normaliseImportPath } from './harvested-path.js'

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
 * Paths rather than {@link ImportFile}s, which is what it took until Task 8 needed it: the caller
 * that asks before grouping is a **staging** area, which holds bytes on a volume and has parsed
 * none of them, so it has paths and nothing else. {@link groupImportFiles} maps its files down to
 * their paths on the way in, and {@link collidingPaths} beside it asks about the same input.
 *
 * @throws Invalid naming which rule a path broke.
 */
export function duplicatePaths(paths: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const collided = new Set<string>()
  for (const raw of paths) {
    const path = normaliseImportPath(raw)
    if (seen.has(path)) collided.add(path)
    seen.add(path)
  }
  return [...collided]
}

/** A path held as a file, beside the path that would put a file inside it. */
export interface PathCollision {
  readonly file: string
  readonly inside: string
}

const ancestorsOf = (path: string): readonly string[] => {
  const segments = path.split(SEPARATOR)
  return segments.slice(0, -1).map((_unused, at) => segments.slice(0, at + 1).join(SEPARATOR))
}

const byCollision = (left: PathCollision, right: PathCollision): number =>
  compare(left.file, right.file) || compare(left.inside, right.inside)

/**
 * The pairs where one path is held as a file and another would be a file **inside** it.
 *
 * {@link duplicatePaths}' companion, and the other half of one question: a set of paths cannot all
 * be files. `a` and `a/b` are not a duplicate — they are two different paths, and
 * {@link normaliseImportPath} admits both, because neither is malformed and the thing that makes
 * them incompatible is the *other* one's presence. A drop can produce the pair (a browser directory
 * pick cannot, but a hand-built request can) and an archive can carry it as two entries.
 *
 * It exists so the refusal is a **422 naming both paths** rather than the 500 the filesystem
 * answers with. Task 7 measured that 500: `appendBytes` on `a/b` where `a` is a file rejects with
 * `ENOTDIR` on POSIX and `ENOENT` on win32, and the port's contract is that a wrong-kind path is a
 * fault rather than an absence — so a caller *must* let it reach the error handler as a 500, and
 * must not catch it, because catching every rejection there would relabel `ENOSPC` and `EACCES` as
 * a client path error. Deciding it here instead costs one string comparison per segment and no
 * syscall, so the answer does not depend on which of the two paths arrived first.
 *
 * Every path is normalised on the way in, for {@link duplicatePaths}' reason and one more: the
 * prefix test is only sound on a canonical form. Raw, `a/./b` does not start with `a/b` and `a//b`
 * does, so both answers would be wrong on the same pair of names.
 *
 * The comparison is by **segment**, never by string prefix: `ab` is not inside `a` though `"ab"`
 * does start with `"a"`, and a caller that used `startsWith` would refuse a drop nothing is wrong
 * with. Pairs come back sorted, so the result is order-independent the way
 * {@link groupImportFiles}' is.
 *
 * @throws Invalid naming which rule a path broke.
 */
export function collidingPaths(paths: readonly string[]): readonly PathCollision[] {
  const unique = new Set(paths.map((path) => normaliseImportPath(path)))
  const found: PathCollision[] = []
  for (const inside of unique) {
    for (const file of ancestorsOf(inside)) {
      if (unique.has(file)) found.push({ file, inside })
    }
  }
  return found.sort(byCollision)
}

const SLASH = SEPARATOR.charCodeAt(0)

const within = (file: string, path: string): boolean =>
  path.length > file.length && path.startsWith(file) && path.charCodeAt(file.length) === SLASH

/**
 * The first collision one **new** path has with a set already held, or null.
 *
 * {@link collidingPaths} asked about one arrival instead of about a whole set, and it exists
 * because the difference is not cosmetic: a chunked upload asks this **once per chunk**, against
 * every path the session holds, from inside the process-wide write lock. Measured in this repo on
 * win32 / Node 22.16, against a held list of realistic project paths: `collidingPaths` over the
 * held set plus one arrival costs 85 ms at ten thousand held paths and 310 ms at fifty thousand —
 * per chunk — because it re-parses every held path through {@link normaliseImportPath} and rebuilds
 * every ancestor string. This costs 0.89 ms and 3.42 ms for the same sets, which puts it under the
 * marker file's own JSON round trip (1.0 + 1.4 ms and 4.3 + 6.9 ms), so the check is no longer what
 * a chunk waits for. Fifty thousand two-kilobyte files is exactly what `MAX_SESSION_BYTES` admits,
 * so the larger figure is reachable rather than theoretical.
 *
 * It is one pass with two prefix tests and no allocation, and it answers both directions the pair
 * can arrive in: an ancestor of the new path is already a file, or the new path is an ancestor of
 * one. The comparison is by segment — `path.charCodeAt(file.length)` must be the separator — so
 * `ab` is not inside `a`, exactly as in {@link collidingPaths}.
 *
 * **`held` is taken as already canonical, and only `path` is normalised.** That is the whole of the
 * saving and it is a real narrowing of the contract: a held path is compared as the literal it is,
 * so a caller holding a raw `a//b` is told nothing about an arrival at `a/b/c`, where
 * {@link collidingPaths} finds that pair. It is sound for the caller this exists
 * for, whose held list is its own record of what it staged, written through `normaliseImportPath`
 * by the thing that staged it. A caller with raw names — a zip's entry list, a drop's harvest —
 * wants the set form, which normalises everything and is cheaper than this one per *arrival* when
 * there are many arrivals at once.
 *
 * @throws Invalid naming which rule `path` broke.
 */
export function collisionWith(held: readonly string[], path: string): PathCollision | null {
  const at = normaliseImportPath(path)
  for (const file of held) {
    if (within(file, at)) return { file, inside: at }
    if (within(at, file)) return { file: at, inside: file }
  }
  return null
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
  const [collided] = duplicatePaths(files.map((harvested) => harvested.path))
  if (collided !== undefined) throw new Conflict(`Two files were harvested for "${collided}"`)
  const buckets = new Map<string, Bucket>()
  for (const harvested of files) {
    const path = normaliseImportPath(harvested.path)
    const placement = placementOf(path)
    fill(bucketFor(buckets, placement), placement.role, { path, json: harvested.json })
  }
  return [...buckets.values()].sort((left, right) => compare(left.key, right.key)).map(sealed)
}
