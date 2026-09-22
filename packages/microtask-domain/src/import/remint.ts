import type { IdGenerator, ProjectScope } from '@repo/kernel'
import type { TaskEntry } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { TaskDocument } from '../entities/task.js'
import type { ConvertedProject } from './legacy.js'

interface TaskMint {
  readonly entry: TaskEntry
  readonly id: string
}

interface LinkMint {
  readonly link: ShareLink
  readonly token: string
}

interface Minted {
  readonly projectId: string
  readonly tasks: readonly TaskMint[]
  readonly links: readonly LinkMint[]
  readonly taskIds: ReadonlyMap<string, string>
  readonly tokens: ReadonlyMap<string, string>
}

function mint(project: ConvertedProject, ids: IdGenerator): Minted {
  const projectId = ids.entityId()
  const tasks = project.manifest.tasks.map((entry) => ({ entry, id: ids.entityId() }))
  const links = project.manifest.shareLinks.map((link) => ({ link, token: ids.token() }))
  return {
    projectId,
    tasks,
    links,
    taskIds: new Map(tasks.map((one) => [one.entry.id, one.id])),
    tokens: new Map(links.map((one) => [one.link.token, one.token])),
  }
}

const movedScope = (scope: ProjectScope, minted: Minted): ProjectScope =>
  scope.kind === 'project'
    ? { kind: 'project', projectId: minted.projectId }
    : {
        kind: 'task',
        projectId: minted.projectId,
        taskId: minted.taskIds.get(scope.taskId) ?? scope.taskId,
      }

const mintedLink = (one: LinkMint, minted: Minted): ShareLink => ({
  ...one.link,
  token: one.token,
  scope: movedScope(one.link.scope, minted),
  createdBy: one.link.createdBy === null ? null : (minted.tokens.get(one.link.createdBy) ?? null),
})

const mintedDocument = (document: TaskDocument, minted: Minted): TaskDocument => ({
  ...document,
  id: minted.taskIds.get(document.id) ?? document.id,
})

/**
 * Rewrites one project's identity so it can land beside the project it was copied from (ADR 0019).
 *
 * This is the `import as new` half of the conflict choice, and the reason it exists is not
 * cosmetic: the original is still on disk still serving its share URLs, so a preserved token would
 * put one token in two `project.json` files. ADR 0019 states the consequence as a live client link
 * opening whichever project the index loaded last; measured against this repo it is harder than
 * that, because a token resolves to exactly one project **by construction** — `ShareIndex.add`
 * refuses a token another project already holds, and `warmTokenIndex` calls it once per manifest,
 * awaited in `main()` before `serve()` with no catch. So two projects carrying one token is the
 * same failure as a manifest missing `shareLinks`: the next container restart never opens a socket.
 * `replace.ts` is the opposite operation, where the identity is the same project's and preserving
 * is the point.
 *
 * Three kinds of identifier are minted: the project id, one id per manifest entry, and one token
 * per share link.
 * Everything that **names** one of them moves with it, and those references are countable rather
 * than assumed: the project id is named by `manifest.id` and by every `scope.projectId`; a task id
 * by its manifest entry, by the `id` inside the task document — which is what `FsProjectStore`
 * passes to `taskFile()`, so the files follow the manifest rather than staying on the old ids and
 * reading as a successful import of empty tasks — and by a task-scoped link's `scope.taskId`; a
 * token by its own link and by the `createdBy` of every link delegated through it.
 *
 * **`createdBy` is rewritten because the failure is intra-project**, not because revocation
 * cascades between projects — it cannot, `ShareLinkService.revoke` taking one `ProjectRef`,
 * reading that one manifest and walking `createdBy` only over its own links, which is what ADR 0010
 * means by "one file read". The failure is the one ADR 0010 states: inside the **new** project a
 * child naming a token that does not exist there is a child its parent's revocation no longer
 * reaches, so a delegated link survives a revoke that should have cut it. A `createdBy` naming a
 * token the bundle did not carry becomes `null` — the admin, as ADR 0010 spells `null` — rather
 * than a dangling reference, since there is no link here for it to descend from.
 *
 * Folder ids and inner tab ids are deliberately **not** minted, and nothing references them across
 * a project: a folder id is named only by `TaskEntry.folderId` in the same manifest, a tab id only
 * inside its own task document, and neither becomes a path segment or an index key. Names,
 * positions, `folderId`, roles, stamps and every cached field are the bundle's, because import
 * writes the timestamps a bundle carries and a copy is a copy (design §7.4).
 *
 * A reference that resolves to nothing is **carried through unchanged** rather than repaired: a
 * `scope.taskId` naming a task this project has not, or a document the manifest names no entry for.
 * The preview's scope-containment and manifest/file cross-checks refuse both, so re-checking a
 * reminted project — which `DroppedProject`'s `'converted'` shape exists to allow — reports the
 * problem, where silently nulling it would import a project nobody could be warned about. A task
 * scope cannot be widened to a project scope instead: that would hand its holder authority no
 * check had agreed to.
 *
 * Every id comes from the injected generator and nothing else, in one order — the project, then
 * each manifest entry in manifest order, then each share link in link order — so a seeded generator
 * makes every assertion about the output exact rather than merely ULID-shaped.
 */
export function remintProject(project: ConvertedProject, ids: IdGenerator): ConvertedProject {
  const minted = mint(project, ids)
  return {
    manifest: {
      ...project.manifest,
      id: minted.projectId,
      tasks: minted.tasks.map((one) => ({ ...one.entry, id: one.id })),
      shareLinks: minted.links.map((one) => mintedLink(one, minted)),
    },
    documents: project.documents.map((one) => mintedDocument(one, minted)),
  }
}
