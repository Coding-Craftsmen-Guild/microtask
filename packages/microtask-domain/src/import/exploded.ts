import type { ImportShapeValue } from '@repo/contracts'
import type { Clock } from '@repo/kernel'
import { convertLegacyProject } from './legacy.js'
import type { DroppedDocument, DroppedProject } from './drop-checks.js'
import { SEPARATOR } from './harvested-path.js'
import { isRecord } from './json.js'
import type { ImportFile, SniffedGroup } from './sniff.js'

const JSON_SUFFIX = '.json'

const BUNDLE_PROJECTS = 'projects'

const BUNDLE_DOCUMENTS = 'taskDocuments'

/**
 * One project a group turned out to hold, as the preview's checks and its row both need it.
 *
 * `drop` is `null` for exactly the groups classification could not read, which carry an `error`
 * instead — the pair a `SniffedGroup`'s `unrecognised` member states, kept because a preview row
 * exists for such a group too and `ImportPreviewGroup` requires it say why.
 *
 * `path` is the identity the row renders and is **not** always the group's own: a workspace bundle
 * holds many projects in one file, and `ImportPreview` allows a project id to be claimed by at
 * most one group, so each is exploded into a row of its own and labelled by its position in the
 * file. That is the same device `drop-checks.ts` uses for a bundled document, which has no path of
 * its own either.
 *
 * `taskFilesFound` means one thing across all four shapes, which is what lets the cross-check read
 * the same way in every row: the task files beside a manifest for a project directory, and the
 * documents carried for the two shapes that embed them.
 */
export interface ExplodedProject {
  readonly path: string
  readonly shape: ImportShapeValue
  readonly taskFilesFound: number
  readonly drop: DroppedProject | null
  readonly error: string | null
}

const taskIdOf = (path: string): string => {
  const name = path.split(SEPARATOR).at(-1) ?? ''
  return name.endsWith(JSON_SUFFIX) ? name.slice(0, -JSON_SUFFIX.length) : name
}

const asDocument = (file: ImportFile): DroppedDocument => ({
  id: taskIdOf(file.path),
  path: file.path,
  json: file.json,
})

const carried = (project: unknown): readonly unknown[] => {
  if (!isRecord(project)) return []
  const documents = project[BUNDLE_DOCUMENTS]
  return Array.isArray(documents) ? documents : []
}

const withoutDocuments = (project: unknown): unknown => {
  if (!isRecord(project)) return project
  return Object.fromEntries(Object.entries(project).filter(([key]) => key !== BUNDLE_DOCUMENTS))
}

function bundledProject(file: ImportFile, project: unknown, label: string): ExplodedProject {
  const documents = carried(project)
  return {
    path: label,
    shape: 'v2-workspace-bundle',
    taskFilesFound: documents.length,
    drop: {
      shape: 'raw',
      path: label,
      manifest: withoutDocuments(project),
      documents: documents.map((json, at) => ({
        id: null,
        path: `${file.path} document ${String(at + 1)}`,
        json,
      })),
    },
    error: null,
  }
}

const projectsIn = (file: ImportFile): readonly unknown[] => {
  const found = isRecord(file.json) ? file.json[BUNDLE_PROJECTS] : []
  return Array.isArray(found) ? found : []
}

const fromBundle = (file: ImportFile, single: boolean): readonly ExplodedProject[] =>
  projectsIn(file).map((project, at) => {
    const label = single ? file.path : `${file.path} project ${String(at + 1)}`
    const exploded = bundledProject(file, project, label)
    return single ? { ...exploded, shape: 'v2-single-project' as const } : exploded
  })

function fromLegacy(file: ImportFile, clock: Clock): ExplodedProject {
  const converted = convertLegacyProject(file.json, clock)
  return {
    path: file.path,
    shape: 'legacy-project',
    taskFilesFound: converted.documents.length,
    drop: { shape: 'converted', path: file.path, converted },
    error: null,
  }
}

/**
 * Turns one classified group into the projects it holds — none, one, or a bundle's worth.
 *
 * The three v2 shapes and the legacy one arrive at the same pair of states, which is the
 * asymmetry `DroppedProject` records: a v2 project is `raw`, because its manifest and documents
 * have to meet their schemas before anything may read a field off them, and a legacy file is
 * already `converted`, `convertLegacyProject` being total over `unknown`.
 *
 * A **bundle becomes many projects**, and it has to: `ImportPreview` allows a project id to be
 * claimed by at most one group, `ImportConfirmRequest` addresses a choice by project id, and a
 * bundle of nine projects where one is refused is nine rows and not one. A single-project bundle
 * keeps the file's own path as its label, that file being the project; a workspace bundle labels
 * each by position, because there is nothing else to tell two of its projects apart by before
 * their manifests have been read.
 *
 * A bundle entry that is not an object at all still becomes a row, carried through as the manifest
 * it claims to be so that the schema check is what refuses it and names the field. Silently
 * dropping it is the failure ADR 0018 exists to close, and it is reachable here in a way it is not
 * elsewhere: `sniffGroup` classifies a file on `format`, `version` and `projects[]` being an array
 * and deliberately never parses it as `ExportBundle`, so what is inside that array is unknown.
 *
 * A **group of no projects** is a group holding an empty `projects[]`, which is the one case this
 * returns nothing for. Such a file is a well-formed export of an empty workspace, and a row saying
 * nothing about no project would be a refusal an admin cannot act on.
 *
 * The **clock is the only port a plan reaches outside itself for**, and it is only read when a
 * legacy file omits a stamp. Nothing anywhere in planning mints an id any more: a legacy file's
 * project id, task id and every tab id are the file's own (`legacy.ts`), so two conversions of one
 * file agree in every byte. The disk is read by whoever hands the files over, and §7.3's *nothing
 * touches disk until confirmed* is that caller's to keep.
 */
export function explodeGroup(
  sniffed: SniffedGroup,
  clock: Clock,
): readonly ExplodedProject[] {
  if (sniffed.shape === 'unrecognised') {
    const { group, error } = sniffed
    return [{ path: group.path, shape: 'unrecognised', taskFilesFound: group.taskFiles.length, drop: null, error }]
  }
  if (sniffed.shape === 'v2-project-directory') {
    const { group, manifest } = sniffed
    const documents = group.taskFiles.map(asDocument)
    const drop = { shape: 'raw', path: group.path, manifest: manifest.json, documents } as const
    return [{ path: group.path, shape: sniffed.shape, taskFilesFound: documents.length, drop, error: null }]
  }
  if (sniffed.shape === 'legacy-project') return [fromLegacy(sniffed.file, clock)]
  return fromBundle(sniffed.file, sniffed.shape === 'v2-single-project')
}
