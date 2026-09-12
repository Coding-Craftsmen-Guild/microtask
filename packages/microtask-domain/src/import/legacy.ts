import type { Clock, IdGenerator } from '@repo/kernel'
import type { DocumentJson } from '../entities/document.js'
import type { ProjectManifest, TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { Tab } from '../entities/tab.js'
import type { TaskDocument } from '../entities/task.js'
import { cleanName } from '../limits.js'
import { taskCache, type TaskCache } from '../services/task-cache.js'

export type { ProjectManifest } from '../entities/manifest.js'
export type { TaskDocument } from '../entities/task.js'

const PROJECT_FALLBACK = 'Untitled project'

const TASK_FALLBACK = 'Untitled task'

const FOLDER_FALLBACK = 'Untitled folder'

const GENERAL_TAB = 'General'

const LEGACY_READ = 'read'

const NO_NAME = ''

/**
 * One project as a bundle carries it: the manifest's own fields, plus a document per task.
 *
 * The structural twin of `@repo/contracts`' `ExportedProject`, stated as an interface because that
 * is how this package states every entity it stores — the agreement with the schema is a test's to
 * hold, not an inferred type's. A v2 project *directory* holds the same content, its manifest with
 * the task files found beside it, so one conversion serves both v2 shapes ADR 0018 detects.
 */
export interface BundledProject extends ProjectManifest {
  readonly taskDocuments: readonly TaskDocument[]
}

/**
 * A project in the shape this repo stores, ready to be checked and then written.
 *
 * The manifest and the documents are separate because that is the split ADR 0005 stores them in,
 * and because the preview's checks run across the pair: the cross-check by task id compares the
 * two, and the bounds are per collection.
 */
export interface ConvertedProject {
  readonly manifest: ProjectManifest
  readonly documents: readonly TaskDocument[]
}

interface Pairing {
  readonly entry: TaskEntry
  readonly document: TaskDocument
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const records = (value: unknown): readonly Record<string, unknown>[] => {
  const members: readonly unknown[] = Array.isArray(value) ? value : []
  return members.map((member) => (isRecord(member) ? member : {}))
}

const text = (value: unknown): string => (typeof value === 'string' ? value : String(value))

const ordinal = (value: unknown): number => (typeof value === 'number' ? value : Number.NaN)

const stamped = (value: unknown, now: string): string =>
  typeof value === 'string' && value !== '' ? value : now

const named = (tab: Tab): Tab => ({ ...tab, name: cleanName(tab.name, GENERAL_TAB) })

const cleaned = (document: TaskDocument): TaskDocument => ({
  ...document,
  tabs: document.tabs.map(named),
})

const refreshed = (entry: TaskEntry, cache: TaskCache | undefined): TaskEntry =>
  cache === undefined ? entry : { ...entry, ...cache }

function legacyLink(link: Record<string, unknown>, projectId: string, now: string): ShareLink {
  return {
    token: text(link['token']),
    name: cleanName(link['name'] ?? link['label'] ?? NO_NAME, NO_NAME),
    role: link['permission'] === LEGACY_READ ? 'view' : 'write',
    scope: { kind: 'project', projectId },
    createdBy: null,
    createdAt: stamped(link['createdAt'], now),
  }
}

function legacyTask(tab: Record<string, unknown>, tabId: string, now: string): Pairing {
  const id = text(tab['id'])
  const createdAt = stamped(tab['createdAt'], now)
  const updatedAt = stamped(tab['updatedAt'], now)
  const inner: Tab = {
    id: tabId,
    name: GENERAL_TAB,
    position: 0,
    document: tab['document'] as DocumentJson,
    createdAt,
    updatedAt,
  }
  const document: TaskDocument = { id, tabs: [inner], createdAt, updatedAt }
  const entry: TaskEntry = {
    id,
    name: cleanName(tab['name'], TASK_FALLBACK),
    position: ordinal(tab['position']),
    folderId: null,
    ...taskCache(document),
  }
  return { entry, document }
}

/**
 * Converts one legacy project file into the project this repo stores (design §7.6).
 *
 * Each legacy **tab** becomes a **task**, taking the tab's `name`, `position` and `id` verbatim
 * and holding that tab's document in a single inner tab named `General`. The inner tab, and only
 * the inner tab, is named that: a task named `General` is a task nobody can find, because search
 * matches names and tab names are deliberately outside its reach (ADR 0021). `folderId` is `null`
 * throughout, legacy having no folders. Positions are copied rather than densified, so two tabs
 * that disagreed in the file still disagree here and the preview is what says so.
 *
 * Share links become **project-scoped**, with tokens preserved, `createdBy` null — legacy has no
 * lineage to cascade — and the three rules `normalizeShareLinks` actually applies, which are
 * broader than the ones a paraphrase of it states: a permission is `read` or it is **write**, so
 * `admin`, `view`, `null` and a missing key all map to `write` rather than to `view`, which would
 * silently take away access a client has today; `name ?? label ?? ''` keeps the name of a link
 * from the generation that stored a `label`; and `createdAt` falls back to the import's clock,
 * which is why one arrives as an argument rather than being read here (this group is pure).
 *
 * Every name goes through {@link cleanName} with a literal fallback, because `EntityName` is
 * `.trim().min(1)` and the only name the contracts let be empty is a share link's. An empty or
 * over-long name is not a write-time problem: the client parses every response through the
 * contract, so one unparseable manifest takes the whole projects index down with it.
 *
 * Everything else is copied, never repaired. `json` is `unknown` because a hostile or hand-edited
 * file reaches here classified rather than refused, so an id that is not a ULID, a position that is
 * not a number and a document that is not a document all arrive as they were written — as text, as
 * `NaN`, and as itself — and are refused by the preview's schema check with a reason that quotes
 * them. A converter that repaired them would import a file nobody could be warned about; one that
 * threw would end an upload that has nine other directories left to describe. Nothing is dropped
 * either: a member of `tabs` that is not an object still becomes a row, because a silent skip is
 * the failure ADR 0018 exists to close.
 */
export function convertLegacyProject(
  json: unknown,
  clock: Clock,
  ids: IdGenerator,
): ConvertedProject {
  const source = isRecord(json) ? json : {}
  const now = clock.now()
  const projectId = text(source['id'])
  const pairings = records(source['tabs']).map((tab) => legacyTask(tab, ids.entityId(), now))
  return {
    manifest: {
      id: projectId,
      name: cleanName(source['name'], PROJECT_FALLBACK),
      folders: [],
      tasks: pairings.map((pairing) => pairing.entry),
      shareLinks: records(source['shareLinks']).map((link) => legacyLink(link, projectId, now)),
      createdAt: stamped(source['createdAt'], now),
      updatedAt: stamped(source['updatedAt'], now),
    },
    documents: pairings.map((pairing) => pairing.document),
  }
}

/**
 * Takes one project out of a bundle, recomputing every cached field from the documents carried.
 *
 * All four of `progress`, `updatedAt`, `tabCount` and `tabNames` come from `taskCache` of the
 * document, because a cache is a cache: what a file asserts about a value that is derivable is
 * evidence about nothing. An entry left with `{done: 0, total: 0}` renders 0% everywhere, and one
 * carrying the *project's* stamp instead of its task document's defeats `cacheAgrees`, which then
 * only self-heals for the tasks somebody happens to open.
 *
 * An entry no document was carried for keeps what it arrived with, there being nothing to count
 * from. That pairing is the preview's cross-check to refuse (`ExportedProject` refines it too), and
 * inventing an empty cache for such an entry would answer a project that is about to be blocked
 * with a row claiming the task is empty.
 *
 * Names are cleaned here as well, tab names included, because `tabNames` is derived from them: a
 * bundle carrying one blank tab name would otherwise produce a manifest no client can parse.
 * Nothing else is touched — ids, stamps, positions, folders and share links are the bundle's, since
 * import writes the timestamps a bundle carries (design §7.4).
 */
export function convertBundledProject(project: BundledProject): ConvertedProject {
  const { taskDocuments, ...manifest } = project
  const documents = taskDocuments.map(cleaned)
  const counted = new Map(documents.map((document) => [document.id, taskCache(document)]))
  return {
    manifest: {
      ...manifest,
      name: cleanName(manifest.name, PROJECT_FALLBACK),
      folders: manifest.folders.map((folder) => ({
        ...folder,
        name: cleanName(folder.name, FOLDER_FALLBACK),
      })),
      tasks: manifest.tasks.map((entry) =>
        refreshed({ ...entry, name: cleanName(entry.name, TASK_FALLBACK) }, counted.get(entry.id)),
      ),
    },
    documents,
  }
}
