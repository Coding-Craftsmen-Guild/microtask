import { Invalid } from '@repo/kernel'

/**
 * The manifest file name a v2 project directory is recognised by (ADR 0018).
 *
 * The same literal `storage/paths.ts` writes, restated here rather than imported because that
 * module's copy is a path **builder's** segment — it is joined onto a resolved root and guarded by
 * `contained()` — while this one is a name matched against text a drop chose. They are equal by
 * the format's definition and would have to change together, which is what makes the duplication
 * safe; a shared constant would instead invite a harvested path to be fed to a builder.
 */
export const MANIFEST_FILE_NAME = 'project.json'

const TASKS_DIR_NAME = 'tasks'

const JSON_SUFFIX = '.json'

const SEPARATOR = '/'

const PARENT = '..'

const CURRENT = '.'

const DRIVE_LETTER = /^[A-Za-z]:/

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
 * by, and `taskFiles` non-empty beside a null `manifest` already is the orphan.
 */
export interface ImportGroup {
  readonly path: string
  readonly manifest: ImportFile | null
  readonly taskFiles: readonly ImportFile[]
  readonly file: ImportFile | null
}

/**
 * Puts one harvested path into the canonical relative form, refusing anything not already in it.
 *
 * This is the one normaliser both browser sources go through — a directory pick's
 * `File.webkitRelativePath` and a drop's `FileSystemEntry.fullPath` — and the server re-runs it on
 * whatever arrives, because a path that reached the API was last touched by the client (ADR 0018).
 * `fullPath` is drag-root-relative and carries a single leading `/` by spec; stripping that prefix
 * is decoding one source into the shared encoding, not a repair, and a leading separator surviving
 * into here can therefore only come from something that is not a browser — a zip entry name, or a
 * body a caller wrote by hand.
 *
 * It **rejects rather than repairs** every form that could address a file the drop did not contain:
 * an absolute path, a `..` segment, a drive letter, and a backslash-separated or UNC path. A
 * sanitiser would have to choose what such a path meant, and every choice is a guess about a file
 * nobody dropped. What it does normalise is only what cannot change what a path names: a repeated
 * separator and a `.` segment collapse, since `a//b` and `a/./b` address `a/b` in every path system
 * there is. A **trailing** separator is refused instead of collapsed, because it does change what
 * the path names — it names a directory, which is what a zip carries its directory entries as, and
 * a group's members are files.
 *
 * `raw` is `unknown` because it is read off a `DataTransfer`, a zip's central directory or a JSON
 * body, and a non-string there has to answer with the same `Invalid` as a hostile one rather than
 * a `TypeError` from the first method call.
 *
 * @throws Invalid naming which rule the path broke.
 */
export function normaliseImportPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') throw new Invalid('An import path cannot be blank')
  if (raw.includes('\\')) throw new Invalid('An import path separates its segments with "/"')
  if (DRIVE_LETTER.test(raw)) throw new Invalid('An import path cannot name a drive')
  if (raw.startsWith(SEPARATOR)) throw new Invalid('An import path has to be relative')
  if (raw.endsWith(SEPARATOR)) throw new Invalid('An import path names a file, not a directory')
  const segments = raw.split(SEPARATOR).filter((segment) => segment !== '' && segment !== CURRENT)
  if (segments.includes(PARENT)) throw new Invalid('An import path cannot step out with ".."')
  if (segments.length === 0) throw new Invalid('An import path cannot be blank')
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
 * no reading of that input under which one of them was the one meant, and a zip — unlike a drop —
 * can carry a duplicate entry name.
 *
 * @throws Invalid for a path {@link normaliseImportPath} refuses, or a duplicate path.
 */
export function groupImportFiles(files: readonly ImportFile[]): readonly ImportGroup[] {
  const buckets = new Map<string, Bucket>()
  const seen = new Set<string>()
  for (const harvested of files) {
    const path = normaliseImportPath(harvested.path)
    if (seen.has(path)) throw new Invalid(`Two files were harvested for "${path}"`)
    seen.add(path)
    const placement = placementOf(path)
    fill(bucketFor(buckets, placement), placement.role, { path, json: harvested.json })
  }
  return [...buckets.values()].sort((left, right) => compare(left.key, right.key)).map(sealed)
}
