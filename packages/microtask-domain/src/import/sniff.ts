import { BUNDLE_FORMAT, BUNDLE_VERSION, type ImportShapeValue } from '@repo/contracts'
import { groupImportFiles, MANIFEST_FILE_NAME } from './grouping.js'
import type { ImportFile, ImportGroup } from './grouping.js'

export type { ImportFile, ImportGroup } from './grouping.js'

const LONGEST_QUOTED_VALUE = 40

const LONGEST_QUOTED_PATH = 120

const NOT_AN_OBJECT = 'This file is not a JSON object, so it is neither a project nor a bundle'

const NOT_OURS = 'This file is neither a Microtask export nor a legacy Microtask project'

const NOTHING_HARVESTED = 'No files were harvested under this path'

const ABSENT = '(absent)'

const LEGACY_KEYS = ['id', 'name', 'tabs', 'shareLinks'] as const

type FileShape = Extract<
  ImportShapeValue,
  'legacy-project' | 'v2-single-project' | 'v2-workspace-bundle'
>

/**
 * What one group was detected as, carrying the one field that shape is read through.
 *
 * A union on `shape`, rather than a shape beside a whole {@link ImportGroup} whose three role
 * fields all stay nullable, because sniffing has already decided which of them is the one to read
 * and a record that threw that away would make every consumer decide again. Task 4 reads a project
 * directory's `manifest` four times over — schema conformance, the id cross-check, folder
 * integrity, the collection bounds — and Task 9 reads a lone file's `file.json`. Non-null
 * assertions are banned here (tseslint `strict`), so each of those reads would otherwise be a null
 * branch reachable only by hand-building a group, and an opportunity to read the field belonging to
 * another shape. `group` stays on every member, so `path` — the identity a preview row renders — is
 * reachable without narrowing at all.
 *
 * Three rules that would otherwise be sentences in this comment are therefore facts the compiler
 * checks: a `v2-project-directory` carries a non-null `manifest`, the three single-file shapes
 * carry a non-null `file`, and an `unrecognised` group carries a non-null `error`. `taskFiles` is
 * deliberately not repeated on the directory member — `ImportGroup.taskFiles` is non-null for
 * every group, so it needs no narrowing and keeps its one home.
 *
 * `error` is a reason rather than a thrown exception because §7.3's preview has to describe every
 * problem at once: a group this repo cannot read is a **row**, not the end of the upload, and the
 * other nine directories in the same drop still have to be previewed. That it is non-null for
 * exactly the `unrecognised` member is what lets the preview builder satisfy
 * `ImportPreviewGroup`'s rule that a row which will not import says why.
 *
 * `shape` reaches `unrecognised` for three quite different reasons — an orphaned `tasks/`
 * directory, a `format`/`version` this repo does not read, and a file that is simply not ours —
 * because `ImportShape` names the four shapes ADR 0018 recognises and nothing else. What separates
 * them is `error`, which is why it names the missing `project.json` and its directory, or the
 * version found beside the version supported, instead of one generic sentence.
 *
 * A reason arrives pre-elided, and the two elisions are **not** the same operation. A quoted value
 * keeps its head (40 characters), which is the informative end of a hostile `format` or `version`.
 * A path keeps both ends around an elided middle (120), because the tail is the only part that
 * identifies a path: the ULID of the directory missing its manifest is the whole content of that
 * message (ADR 0018), and head-truncation drops exactly that. `MAX_PREVIEW_TEXT_LENGTH` states the
 * same policy for the schema these reasons are stored in.
 */
export type SniffedGroup =
  | {
      readonly shape: Extract<ImportShapeValue, 'v2-project-directory'>
      readonly group: ImportGroup
      readonly manifest: ImportFile
      readonly error: null
    }
  | {
      readonly shape: FileShape
      readonly group: ImportGroup
      readonly file: ImportFile
      readonly error: null
    }
  | {
      readonly shape: Extract<ImportShapeValue, 'unrecognised'>
      readonly group: ImportGroup
      readonly error: string
    }

type DetectedFile =
  | { readonly shape: FileShape; readonly error: null }
  | { readonly shape: Extract<ImportShapeValue, 'unrecognised'>; readonly error: string }

function quoted(value: unknown): string {
  const text = value === undefined ? ABSENT : String(value)
  const points = [...text]
  if (points.length <= LONGEST_QUOTED_VALUE) return text
  return `${points.slice(0, LONGEST_QUOTED_VALUE).join('')}…`
}

function elided(path: string): string {
  const points = [...path]
  if (points.length <= LONGEST_QUOTED_PATH) return path
  const head = Math.ceil((LONGEST_QUOTED_PATH - 1) / 2)
  const tail = LONGEST_QUOTED_PATH - 1 - head
  return `${points.slice(0, head).join('')}…${points.slice(points.length - tail).join('')}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLegacyProject = (json: Record<string, unknown>): boolean =>
  LEGACY_KEYS.every((key) => Object.hasOwn(json, key))

function detectedBundle(json: Record<string, unknown>): DetectedFile {
  const format = json['format']
  if (format !== BUNDLE_FORMAT) {
    const found = quoted(format)
    return { shape: 'unrecognised', error: `Format "${found}" is not "${BUNDLE_FORMAT}"` }
  }
  const version = json['version']
  if (version !== BUNDLE_VERSION) {
    const found = quoted(version)
    const reason = `This file is ${BUNDLE_FORMAT} version ${found}; import reads version ${BUNDLE_VERSION}`
    return { shape: 'unrecognised', error: reason }
  }
  const projects = json['projects']
  if (!Array.isArray(projects)) {
    const reason = `A ${BUNDLE_FORMAT} version ${BUNDLE_VERSION} file carries a projects[] array; this one does not`
    return { shape: 'unrecognised', error: reason }
  }
  return { shape: projects.length === 1 ? 'v2-single-project' : 'v2-workspace-bundle', error: null }
}

function detectedFile(json: unknown): DetectedFile {
  if (!isRecord(json)) return { shape: 'unrecognised', error: NOT_AN_OBJECT }
  if (Object.hasOwn(json, 'format')) return detectedBundle(json)
  if (isLegacyProject(json)) return { shape: 'legacy-project', error: null }
  return { shape: 'unrecognised', error: NOT_OURS }
}

const reported = (group: ImportGroup, error: string): SniffedGroup => ({
  shape: 'unrecognised',
  group,
  error,
})

const orphaned = (path: string): string =>
  `"${elided(path)}" has task files but no ${MANIFEST_FILE_NAME} beside them`

function loneFile(group: ImportGroup, file: ImportFile): SniffedGroup {
  const detected = detectedFile(file.json)
  if (detected.shape === 'unrecognised') return reported(group, detected.error)
  return { shape: detected.shape, group, file, error: null }
}

/**
 * Detects which of ADR 0018's four shapes one group is, or says in one sentence why it is none.
 *
 * The order the tests are applied in is the decision. A group holding a `project.json` **is** a v2
 * project directory whatever its manifest contains, so it is answered first and its `tasks/*.json`
 * stay members; only then is a group of task files with no manifest reported as the orphan ADR 0018
 * requires be named against the directory that is missing one. A loose file is classified by its
 * own content, and there the order is `format` first: a file carrying `format` is claiming to be a
 * v2 export, so it is never read as a legacy project even when it also carries the four legacy keys.
 *
 * A file of this repo's `format` is classified on `format`, `version` and `projects[]` and **on
 * nothing else** — never by parsing it as `ExportBundle`. That schema checks two rules across the
 * manifest and the documents it carries, so a bundle whose `tabCount` overcounts fails it; sniffing
 * through it would land such a file on `unrecognised` and tell an admin their own export is not a
 * Microtask file, instead of classifying it and letting the preview block it with the reason it
 * actually failed for. Which is also why a wrong `version` is a sentence naming the version found
 * beside the version supported: the file plainly is ours, and "unrecognised" would deny it.
 *
 * A legacy project is detected by the **presence** of `id`, `name`, `tabs` and `shareLinks`, and
 * not by their types, which is that same principle applied to the file this migration will actually
 * meet: a truncated or hand-edited legacy project whose `tabs` is a string or `null`. Answering
 * that with `unrecognised` would say "this is neither a Microtask export nor a legacy Microtask
 * project" about a file that plainly is one, and would route it away from Task 4 — the one layer
 * that can say which key is wrong. `convertLegacyProject` is total over `unknown` so that it can.
 *
 * A bundle carrying exactly one project is reported as `v2-single-project`. Both of ADR 0018's v2
 * file shapes are detected by `format` + `version`, and there is only one v2 file this repo writes
 * — `ExportBundle`, always with a `projects[]` — so "one project" is that array holding one, and
 * the distinction is what the preview row says rather than a second format to read.
 *
 * A group holding no file in any role is answered rather than assumed away.
 * {@link groupImportFiles} cannot produce one, every bucket being created around the file that
 * caused it, but `ImportGroup` admits it and this function is exported, so the sentence exists for
 * a group built by hand.
 */
export function sniffGroup(group: ImportGroup): SniffedGroup {
  const { manifest, file } = group
  if (manifest !== null) return { shape: 'v2-project-directory', group, manifest, error: null }
  if (group.taskFiles.length > 0) return reported(group, orphaned(group.path))
  if (file === null) return reported(group, NOTHING_HARVESTED)
  return loneFile(group, file)
}

/**
 * Groups harvested files by directory and classifies every group — the server's whole entry point.
 *
 * It normalises each path again on the way in, through {@link groupImportFiles}, so a hostile path
 * is refused here whatever the client did with it (ADR 0018). Those are the only two things in
 * this module that throw, and they throw different errors because they ask for different remedies:
 * a path is refused as `Invalid`, a path harvested twice is a collision and is `Conflict`, whereas
 * a file is *reported*.
 *
 * @throws Invalid naming which rule a path broke.
 * @throws Conflict when two files were harvested for one normalised path.
 */
export function sniffImportFiles(files: readonly ImportFile[]): readonly SniffedGroup[] {
  return groupImportFiles(files).map(sniffGroup)
}
