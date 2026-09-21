import { isUlid } from '@repo/kernel'
import { assertSafeDocument } from '../document-guard.js'
import type { ProjectManifest as Manifest } from '../entities/manifest.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument as Document } from '../entities/task.js'
import type { ConvertedProject } from './legacy.js'
import { linkReasons, type TargetTokens, type TokenCarriers } from './link-checks.js'
import { listed, overBound, quotedId, when } from './refusal.js'

export type { TargetTokens, TokenCarriers } from './link-checks.js'

interface IdKind {
  readonly label: string
  readonly of: (project: ConvertedProject) => readonly string[]
}

const missingFrom = (wanted: readonly string[], held: ReadonlySet<string>): readonly string[] => [
  ...new Set(wanted.filter((id) => !held.has(id))),
]

function crossCheckReasons(
  manifest: Manifest,
  documents: readonly Document[],
  named: readonly (string | null)[],
): readonly string[] {
  const carried = documents.map((one, index) => named[index] ?? one.id)
  const wanted = manifest.tasks.map((entry) => entry.id)
  const orphaned = missingFrom(wanted, new Set(carried))
  const spare = missingFrom(carried, new Set(wanted))
  const misfiled = documents.filter((one, index) => (named[index] ?? one.id) !== one.id)
  return [
    ...when(
      orphaned.length > 0,
      `The manifest names tasks the drop carries no document for: ${listed(orphaned)}`,
    ),
    ...when(
      spare.length > 0,
      `The drop carries documents the manifest names no task for: ${listed(spare)}`,
    ),
    ...misfiled.map((one) => `A task file holds the document of task ${quotedId(one.id)}`),
  ]
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

function sharedTabReasons(document: Document): readonly string[] {
  const shared = repeated(tabIds(document))
  const reason = `Task ${quotedId(document.id)} holds tabs sharing an id: ${listed(shared)}`
  return when(shared.length > 0, reason)
}

function uniqueReasons(manifest: Manifest, documents: readonly Document[]): readonly string[] {
  const tasks = repeated(manifest.tasks.map((entry) => entry.id))
  const folders = repeated(manifest.folders.map((one) => one.id))
  return [
    ...when(tasks.length > 0, `Two tasks share an id: ${listed(tasks)}`),
    ...when(folders.length > 0, `Two folders share an id: ${listed(folders)}`),
    ...documents.flatMap(sharedTabReasons),
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
    const why = error instanceof Error ? error.message : 'the document guard refused it'
    const where = `project ${quotedId(projectId)} task ${quotedId(taskId)} tab ${quotedId(tab.id)}`
    return [`The document of ${where} cannot be stored: ${why}`]
  }
}

const safetyReasons = (manifest: Manifest, documents: readonly Document[]): readonly string[] =>
  documents.flatMap((one) => one.tabs.flatMap((tab) => unsafeReason(manifest.id, one.id, tab)))

/**
 * The blocking checks that read one project in the shape this repo stores.
 *
 * Of the nine the plan lists, these are the manifest/file cross-check, id validity, id uniqueness,
 * folder reference integrity, the collection bounds and document validation; `link-checks.ts` holds
 * the three that read a share link — token and role validity, scope containment, token uniqueness —
 * and `drop-checks.ts` the schema conformance that has to run before any of these can read a field.
 * The session's own two, a project id claimed twice and `projectsPerProduct`, are in `checks.ts`.
 * None of them throws and none of them warns: a project that fails comes back with **every** reason
 * it failed for, because §7.3's preview has to describe every problem at once and a queue of
 * re-uploads is not a migration.
 *
 * The **cross-check compares ids, not counts**. Nine entries beside nine files whose ids do not
 * correspond is the same observable failure ADR 0018 exists to prevent — nine documents on the floor
 * behind a preview that truthfully says "9 and 9" — and a count comparison cannot see it. Both
 * differences are reported, being different problems with different remedies: an entry with no
 * document restores an empty task, a document no entry names is content nothing will ever open. Its
 * third reason has no set difference behind it and is the case neither difference can see — a file
 * named `tasks/<id>.json` for an id the manifest *does* name, holding the document of a different
 * task. `convertBundledProject` pairs a document to its entry by the id **inside** the document, so
 * such a file leaves its entry's cache untouched and puts the wrong content where the manifest says
 * the right content is.
 *
 * Several checks are redundant on one path or the other, deliberately rather than by oversight. On
 * a v2 drop `ProjectManifest` has already refused a malformed id and an over-cap collection, so
 * those can change no outcome there; on a converted legacy project the converter has already
 * guaranteed the names, and the schema conformance that runs on that converted manifest bounds its
 * collections too. What each still contributes is its **own sentence**, a zod issue path naming a
 * field where these name the problem — `tasksPerProject` and `shareLinksPerProject` are the two
 * that can still say something `tasks` or `shareLinks` alone does not. The one check that is
 * load-bearing rather than merely legible is the id: nothing else refuses a non-ULID **task** id
 * before `taskFile()` throws at write time with half a bundle already on disk. That reaches a
 * legacy file through its *project* id now rather than through a tab id — the single task a legacy
 * file converts to takes the project's own id (§7.6 as corrected 2026-09-21), so a legacy tab id
 * is checked here under `Tab` and becomes no path segment at all.
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
