import { isUlid } from '@repo/kernel'
import { assertSafeDocument } from '../document-guard.js'
import type { ProjectManifest as Manifest } from '../entities/manifest.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument as Document } from '../entities/task.js'
import { crossCheckReasons } from './drop-checks.js'
import type { ConvertedProject } from './legacy.js'
import { linkReasons, type TargetTokens, type TokenCarriers } from './link-checks.js'
import { listed, overBound, quotedId, when } from './refusal.js'

export type { TargetTokens, TokenCarriers } from './link-checks.js'

interface IdKind {
  readonly label: string
  readonly of: (project: ConvertedProject) => readonly string[]
}

const tabIds = (document: Document): readonly string[] => document.tabs.map((tab) => tab.id)

const ID_KINDS: readonly IdKind[] = [
  { label: 'Project', of: (project) => [project.manifest.id] },
  { label: 'Task', of: (project) => project.manifest.tasks.map((entry) => entry.id) },
  { label: 'Folder', of: (project) => project.manifest.folders.map((one) => one.id) },
  { label: 'Tab', of: (project) => project.documents.flatMap(tabIds) },
]

const idReasons = (project: ConvertedProject): readonly string[] =>
  ID_KINDS.flatMap((kind) =>
    kind
      .of(project)
      .filter((id) => !isUlid(id))
      .map((id) => `${kind.label} id ${quotedId(id)} is not a ULID`),
  )

function repeated(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const twice = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) twice.add(id)
    seen.add(id)
  }
  return [...twice]
}

function uniqueReasons(manifest: Manifest, documents: readonly Document[]): readonly string[] {
  const tasks = repeated(manifest.tasks.map((entry) => entry.id))
  const folders = repeated(manifest.folders.map((one) => one.id))
  const tabs = documents.flatMap((one) => {
    const shared = repeated(tabIds(one))
    const reason = `Task ${quotedId(one.id)} holds tabs sharing an id: ${listed(shared)}`
    return when(shared.length > 0, reason)
  })
  return [
    ...when(tasks.length > 0, `Two tasks share an id: ${listed(tasks)}`),
    ...when(folders.length > 0, `Two folders share an id: ${listed(folders)}`),
    ...tabs,
  ]
}

function folderReasons(manifest: Manifest): readonly string[] {
  const known = new Set(manifest.folders.map((one) => one.id))
  const dangling = manifest.tasks.filter(
    (entry) => entry.folderId !== null && !known.has(entry.folderId),
  )
  const names = (id: string): string => `folder ${quotedId(id)}, which this project has not`
  return dangling.map((entry) => `Task ${quotedId(entry.id)} names ${names(String(entry.folderId))}`)
}

function boundReasons(manifest: Manifest, documents: readonly Document[]): readonly string[] {
  const tabs = documents.flatMap((one) =>
    overBound('tabsPerTask', one.tabs.length, `Task ${quotedId(one.id)}`),
  )
  return [
    ...overBound('tasksPerProject', manifest.tasks.length, 'This project'),
    ...overBound('foldersPerProject', manifest.folders.length, 'This project'),
    ...overBound('shareLinksPerProject', manifest.shareLinks.length, 'This project'),
    ...tabs,
  ]
}

function unsafeReason(projectId: string, taskId: string, tab: Tab): readonly string[] {
  try {
    assertSafeDocument(tab.document)
    return []
  } catch (error) {
    const why = error instanceof Error ? error.message : 'it cannot be stored'
    const where = `project ${quotedId(projectId)} task ${quotedId(taskId)} tab ${quotedId(tab.id)}`
    return [`The document of ${where} cannot be stored: ${why}`]
  }
}

const safetyReasons = (manifest: Manifest, documents: readonly Document[]): readonly string[] =>
  documents.flatMap((one) => one.tabs.flatMap((tab) => unsafeReason(manifest.id, one.id, tab)))

/**
 * Every blocking check that reads one project in the shape this repo stores.
 *
 * Seven of the plan's eight, the eighth being the schema conformance that had to run before any of
 * these could read a field (`drop-checks.ts`). None of them throws and none of them warns: a
 * project that fails comes back with **every** reason it failed for, because §7.3's preview has to
 * describe every problem at once and a queue of re-uploads is not a migration.
 *
 * Several are redundant on one path or the other, deliberately rather than by oversight. On a v2
 * drop `ProjectManifest` has already refused a malformed id, token, role and over-cap collection,
 * so those checks can change no outcome there; on a converted legacy project the converters have
 * already guaranteed the names and the roles. What each still contributes is its **own sentence** —
 * a zod issue path names a field where these name the problem — and the reason to keep all of them
 * is that each one's absence is a different live hole: the id check is the only thing refusing a
 * non-ULID legacy task id before `taskFile()` throws at write time with half a bundle on disk, and
 * the collection counts are the only thing bounding a converted legacy project.
 *
 * `assertSafeDocument` is called rather than reimplemented, §7.5 being already built: depth, banned
 * keys, the href and src scheme allowlist and the 2 MB bound, walked iteratively. It throws, so the
 * `Invalid` it raises is turned into a reason here — the point of running it at preview is that a
 * `javascript:` href is refused before half the bundle has landed, not during the write.
 *
 * Folder references are refused and not repaired by nulling them: `assertFolder` treats "the folder
 * exists in this project" as an invariant on every create, move and reorder, and import is the only
 * write path that can violate it. `folders[]` is read from the task's **own** project, which is
 * what a bundle makes load-bearing.
 */
export function projectReasons(
  project: ConvertedProject,
  named: readonly (string | null)[],
  owners: TokenCarriers,
  target: TargetTokens,
): readonly string[] {
  const { manifest, documents } = project
  return [
    ...crossCheckReasons(manifest, documents, named),
    ...idReasons(project),
    ...uniqueReasons(manifest, documents),
    ...folderReasons(manifest),
    ...boundReasons(manifest, documents),
    ...safetyReasons(manifest, documents),
    ...linkReasons(manifest, owners, target),
  ]
}
