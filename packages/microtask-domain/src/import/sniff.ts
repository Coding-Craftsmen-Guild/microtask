import { BUNDLE_FORMAT, BUNDLE_VERSION, type ImportShapeValue } from '@repo/contracts'
import { groupImportFiles, MANIFEST_FILE_NAME } from './grouping.js'
import type { ImportFile, ImportGroup } from './grouping.js'

const LONGEST_QUOTED_VALUE = 40

const LONGEST_QUOTED_PATH = 120

const NOT_AN_OBJECT = 'This file is not a JSON object, so it is neither a project nor a bundle'

const NOT_OURS = 'This file is neither a Microtask export nor a legacy Microtask project'

const NOTHING_HARVESTED = 'No files were harvested under this path'

const LEGACY_KEYS = ['id', 'name'] as const

const LEGACY_ARRAYS = ['tabs', 'shareLinks'] as const

/**
 * What one group was detected as, and — when it was not read — the sentence saying why.
 *
 * `error` is a reason rather than a thrown exception because §7.3's preview has to describe every
 * problem at once: a group this repo cannot read is a **row**, not the end of the upload, and the
 * other nine directories in the same drop still have to be previewed. It is non-null for every
 * `unrecognised` group and null for every group that was classified, which is what lets the
 * preview builder satisfy `ImportPreviewGroup`'s rule that a row which will not import says why.
 *
 * `shape` reaches `unrecognised` for three quite different reasons — an orphaned `tasks/`
 * directory, a `format`/`version` this repo does not read, and a file that is simply not ours —
 * because `ImportShape` names the four shapes ADR 0018 recognises and nothing else. What separates
 * them is `error`, which is why it names the missing `project.json` and its directory, or the
 * version found beside the version supported, instead of one generic sentence.
 */
export interface SniffedGroup {
  readonly group: ImportGroup
  readonly shape: ImportShapeValue
  readonly error: string | null
}

type Detected = Omit<SniffedGroup, 'group'>

function quoted(value: unknown, longest: number): string {
  const text = value === undefined ? 'nothing' : String(value)
  const cut = [...text].slice(0, longest).join('')
  return cut === text ? text : `${cut}…`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isLegacyProject = (json: Record<string, unknown>): boolean =>
  LEGACY_KEYS.every((key) => Object.hasOwn(json, key)) &&
  LEGACY_ARRAYS.every((key) => Array.isArray(json[key]))

function detectedBundle(json: Record<string, unknown>): Detected {
  const format = json['format']
  if (format !== BUNDLE_FORMAT) {
    const found = quoted(format, LONGEST_QUOTED_VALUE)
    return { shape: 'unrecognised', error: `Format "${found}" is not "${BUNDLE_FORMAT}"` }
  }
  const version = json['version']
  if (version !== BUNDLE_VERSION) {
    const found = quoted(version, LONGEST_QUOTED_VALUE)
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

function detectedFile(json: unknown): Detected {
  if (!isRecord(json)) return { shape: 'unrecognised', error: NOT_AN_OBJECT }
  if (Object.hasOwn(json, 'format')) return detectedBundle(json)
  if (isLegacyProject(json)) return { shape: 'legacy-project', error: null }
  return { shape: 'unrecognised', error: NOT_OURS }
}

function detectedGroup(group: ImportGroup): Detected {
  if (group.manifest !== null) return { shape: 'v2-project-directory', error: null }
  if (group.taskFiles.length > 0) {
    const where = quoted(group.path, LONGEST_QUOTED_PATH)
    const reason = `"${where}" has task files but no ${MANIFEST_FILE_NAME} beside them`
    return { shape: 'unrecognised', error: reason }
  }
  if (group.file === null) return { shape: 'unrecognised', error: NOTHING_HARVESTED }
  return detectedFile(group.file.json)
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
 * A bundle carrying exactly one project is reported as `v2-single-project`. Both of ADR 0018's v2
 * file shapes are detected by `format` + `version`, and there is only one v2 file this repo writes
 * — `ExportBundle`, always with a `projects[]` — so "one project" is that array holding one, and
 * the distinction is what the preview row says rather than a second format to read.
 */
export function sniffGroup(group: ImportGroup): SniffedGroup {
  const detected = detectedGroup(group)
  return { group, shape: detected.shape, error: detected.error }
}

/**
 * Groups harvested files by directory and classifies every group — the server's whole entry point.
 *
 * It normalises each path again on the way in, through {@link groupImportFiles}, so a hostile path
 * is refused here whatever the client did with it (ADR 0018). That is the only thing in this module
 * that throws: a path is refused, whereas a file is *reported*.
 *
 * @throws Invalid for a path that is not a clean relative one, or for a duplicate path.
 */
export function sniffImportFiles(files: readonly ImportFile[]): readonly SniffedGroup[] {
  return groupImportFiles(files).map(sniffGroup)
}
