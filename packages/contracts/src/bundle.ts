import { z } from 'zod'
import { EntityId } from './document.js'
import { LIMITS } from './limits.js'
import { ProjectManifest } from './project.js'
import type { TaskEntry } from './task.js'
import { TaskDocument } from './task.js'

/**
 * The `format` string every bundle this repo writes carries.
 *
 * One half of the discriminator classification reads before anything else (ADR 0018), which is
 * why it is declared below as a literal and not as `z.string()`: a bundle whose `format` were any
 * string could not be told from another product's export, and a file that cannot be classified is
 * a file that imports quietly as the wrong shape.
 */
export const BUNDLE_FORMAT = 'ccg.microtask'

/**
 * The bundle version this repo reads and writes.
 *
 * The other half of that discriminator, literal for the same reason. It is a named constant so
 * that a file carrying `format` with some other version can be refused by a message quoting the
 * version found and the version supported, rather than as an unrecognised file — which would read
 * as "this is not ours" about a file that plainly is.
 */
export const BUNDLE_VERSION = 2

interface TaskPairing {
  readonly tasks: readonly Pick<z.infer<typeof TaskEntry>, 'id' | 'tabCount'>[]
  readonly taskDocuments: readonly Pick<z.infer<typeof TaskDocument>, 'id' | 'tabs'>[]
}

const oneDocumentPerTask = (project: TaskPairing): boolean => {
  const carried = new Set(project.taskDocuments.map((document) => document.id))
  return (
    project.taskDocuments.length === project.tasks.length &&
    carried.size === project.tasks.length &&
    project.tasks.every((entry) => carried.has(entry.id))
  )
}

const keepsEveryTab = (project: TaskPairing): boolean => {
  const counts = new Map(project.taskDocuments.map((document) => [document.id, document.tabs.length]))
  return project.tasks.every((entry) => {
    const found = counts.get(entry.id)
    return found === undefined || entry.tabCount <= found
  })
}

const exportedProjectFields = ProjectManifest.extend({
  taskDocuments: z.array(TaskDocument).max(LIMITS.tasksPerProject),
})

/**
 * One project and a document for every task its manifest names.
 *
 * The manifest's own fields extended rather than restated, for the reason {@link ProjectManifest}
 * is extended by a view: a field added to a project cannot then be left out of an export, and
 * neither collection bound is written down a second time. `shareLinks` stays **required**, so a
 * token-stripped export carries an empty block rather than an absent one — `warmTokenIndex` and
 * `ShareIndex.add` both dereference that block on the way to serving a socket, and an import is
 * the one write path that can put a manifest on disk without it.
 *
 * Two rules are checked across the two collections, because a bundler that kept less than it was
 * copying otherwise writes a file that reads exactly like a whole one:
 *
 * - **One document per manifest entry, and no document for an entry that is not there.** This is
 *   the schema half of the cross-check the preview runs by id: a bundler that mapped over only its
 *   first task, or that wrote one task's document twice, produces a file that looks like a whole
 *   project and restores an empty one.
 * - **No entry may count more tabs than the document carried for it holds.** Truncation is the
 *   failure ADR 0018 was written about, and `tabCount` is the honest total a list row draws "+N
 *   more" from, so an entry claiming nine tabs beside a document holding one is a bundle that has
 *   already lost the documents. It is an inequality rather than an equality on purpose: a cache
 *   that *undercounts* is merely stale, and import recomputes all four cache fields from the
 *   documents it is given (ADR 0007), so refusing that would refuse a bundle with nothing wrong
 *   with it.
 *
 * Those two and deliberately no further one, so the guarantee is a pairing and not referential
 * integrity: a task's non-null `folderId` may name a folder outside its own `folders`, and a share
 * link's `scope` may name a foreign `projectId` or a `taskId` no entry carries. Both are the
 * **preview's** checks to make (Task 4's audited folder-reference integrity and scope containment),
 * because both run on the converted v2 shape that a legacy file only has after conversion — a rule
 * here would refuse such a file before conversion had a chance to make it whole. Neither rule above
 * catches a bundler that truncated the tabs **and** recomputed the cache from what it kept either:
 * the pairing is structural, the tab bodies are not.
 *
 * `.refine()` makes this a refined object schema, which in zod 4 closes most of the ways this
 * package composes: `.omit()`, `.pick()` and `.partial()` **throw where they are called** (zod
 * 4.6.1), and `z.object({ ...ExportedProject.shape })` silently drops both rules. `.extend()` with
 * a new key carries them, and overwriting a key needs `.safeExtend()`. So a shape derived from this
 * one — the token-stripped export of `?tokens=strip`, a converted-shape check — builds on the
 * unrefined `exportedProjectFields` above and re-applies what still holds; exporting that base is
 * the change to make when something outside this module needs it.
 */
export const ExportedProject = exportedProjectFields
  .refine(oneDocumentPerTask, {
    error: 'a bundle carries exactly one task document for each task its manifest names',
    path: ['taskDocuments'],
  })
  .refine(keepsEveryTab, {
    error: 'a task document carries fewer tabs than its manifest entry counts',
    path: ['taskDocuments'],
  })
  .meta({ id: 'ExportedProject', description: 'One project and the full document of every task it names' })

/**
 * A whole export: the discriminator, when it was taken, its own id, and the projects in it.
 *
 * `bundleId` is a fresh ULID per export and exists so that "did I already import this?" is
 * answerable at all. `exportedAt` is a `z.string()` like every other timestamp in this package,
 * and deliberately neither coerced nor transformed: a bundle is written, read back and compared
 * against the export it came from, and a schema that turned a stamp into a `Date` — or renormalised
 * it — would break that round trip invisibly while every other test stayed green. Import writes the
 * timestamps a bundle carries (design §7.4), so the string in the file is the string on disk.
 *
 * `projects` is bounded by the same `projectsPerProduct` that `ProjectService.create` compares
 * against, so a bundle this repo writes can always be read back. A larger one is not silently
 * halved: classification only reads the two discriminator fields, so an over-cap file is still
 * recognised as this shape and is refused by the preview with a reason that names the bound.
 */
export const ExportBundle = z
  .object({
    format: z.literal(BUNDLE_FORMAT),
    version: z.literal(BUNDLE_VERSION),
    exportedAt: z.string(),
    bundleId: EntityId,
    projects: z.array(ExportedProject).max(LIMITS.projectsPerProduct),
  })
  .meta({ id: 'ExportBundle', description: 'An export: every project in it, with every task document' })
