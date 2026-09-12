import type { ProjectManifest } from '../entities/manifest.js'
import type { ShareLink } from '../entities/share-link.js'
import type { ConvertedProject } from './legacy.js'

const stranded = (
  links: readonly ShareLink[],
  from: number,
  named: ReadonlySet<string>,
): readonly number[] =>
  links.flatMap((link, at) =>
    at >= from && link.scope.kind === 'task' && !named.has(link.scope.taskId) ? [at] : [],
  )

/**
 * What a `replace` resolves to: the project to write, and the tasks it drops.
 *
 * `removedTaskIds` is separate from `project` because the manifest cannot express it. Dropping an
 * entry leaves `tasks/<id>.json` where it was, orphaned content nothing lists and nothing opens,
 * so the ids come back beside the manifest rather than only being absent from it. How they are
 * applied is ADR 0006's to settle and not stated here: a project built whole and moved into place
 * drops them by construction, where an apply that writes in place has to delete them — and such an
 * apply reaches for `ProjectStore.deleteTask` rather than `TaskService.remove`, every mutating
 * service method taking the same non-reentrant `QueueLock` a confirm already holds (ADR 0030).
 * Either way this is the statement of what a replace removes, which a per-project outcome has to
 * be able to report.
 *
 * `strandedTaskScopes` indexes into `project.manifest.shareLinks` and names the **kept** links this
 * replace invalidates: one scoped to a task that was on disk and that the bundle does not carry.
 * It is reported and not acted on, because each alternative is worse. Widening the scope to the
 * project grants authority nothing agreed to. Dropping the link silently withdraws access nobody
 * revoked, which is what the keep rule exists to prevent. Blocking the replace refuses an
 * operation the admin asked for over a state the **ordinary API already produces**:
 * `TaskService.remove` rebuilds the manifest as `{...current, tasks, updatedAt}` and leaves
 * `shareLinks` untouched, so any `manage` holder deleting a task strands a scope exactly this way.
 * So it is a link that 404s, which this product already tolerates — and the admin is told how many
 * before confirming, that being a consequence of their own choice rather than something to
 * discover later.
 *
 * An index and not a token: a token is a credential, and the scope it names reads off the link at
 * that index. It is also the handle the rest of the import already speaks in — a preview reason
 * marks a link `Share link <index>`, and `ImportPreviewShareLink` carries a stable per-preview
 * index for this kind of reference.
 */
export interface Replacement {
  readonly project: ConvertedProject
  readonly removedTaskIds: readonly string[]
  readonly strandedTaskScopes: readonly number[]
}

/**
 * Resolves a bundle against the project it collides with, keeping the identity both share.
 *
 * The opposite of `remint.ts` in every respect that matters, and for one reason: this **is** the
 * project on disk, so preserving is safe where preservation is a collision by construction for a
 * copy (ADR 0019). Tokens, the project id and the ids of every task the bundle carries all come
 * through unchanged, which is the whole reason import is the migration path — the URLs already sent
 * to clients keep opening the same content. The timestamps are the bundle's too; import writes what
 * a bundle carries and stamps nothing (design §7.4), so a round trip is stable.
 *
 * It is a **replace and not a merge**, so a task on disk the bundle does not carry goes. That half
 * cannot be read off the manifest afterwards, so it is named: see {@link Replacement}.
 *
 * The one thing it does **not** replace is a share link the bundle never mentions. Those are kept,
 * because a bundle exported before a link was minted is not a statement that the link should be
 * revoked, and an import silently withdrawing a client's access is the failure ADR 0010 gives
 * revocation an explicit, counted confirmation to avoid. A link the bundle *does* carry is taken
 * from the bundle — its name and role included — that being what is being imported.
 *
 * Keeping every unmentioned link is also what makes this the operation that needs no lineage pass
 * at all: preserved tokens plus kept links means every token either manifest held still exists, so
 * no `createdBy` that resolved before this stops resolving afterwards. The bundle's links come
 * first and the kept ones follow, so a replace into a store holding nothing produces exactly the
 * bundle's manifest — which is what lets an export/import/export round trip compare equal.
 *
 * Nothing re-checks the result, and a replace does not need it: the preview checked the incoming
 * project, and the merge adds nothing the preview did not see. **Scope containment in particular
 * is an import guard and not a store invariant** — it exists to refuse a *bundle* asserting a
 * scope it has no business asserting — so applying it to a link kept from disk would refuse a link
 * this store validated when it was minted, over a task the admin has just chosen to drop. What
 * that costs is reported instead; see {@link Replacement}. Reminting is the opposite case and must
 * be re-checked, rewriting the incoming project and taking a new project id.
 *
 * `current` is assumed to be the manifest of the project `incoming` collides with; the id written
 * is `incoming`'s. Nothing here reads a clock or a generator, a replace minting nothing.
 */
export function replaceProject(
  incoming: ConvertedProject,
  current: ProjectManifest,
): Replacement {
  const carried = new Set(incoming.manifest.shareLinks.map((one) => one.token))
  const named = new Set(incoming.manifest.tasks.map((entry) => entry.id))
  const kept = current.shareLinks.filter((one) => !carried.has(one.token))
  const shareLinks = [...incoming.manifest.shareLinks, ...kept]
  return {
    project: {
      manifest: { ...incoming.manifest, shareLinks },
      documents: incoming.documents,
    },
    removedTaskIds: current.tasks.map((entry) => entry.id).filter((id) => !named.has(id)),
    strandedTaskScopes: stranded(shareLinks, incoming.manifest.shareLinks.length, named),
  }
}
