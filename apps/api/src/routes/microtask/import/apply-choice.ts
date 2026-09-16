import type { ConflictChoiceValue } from '@repo/contracts'
import {
  checkImport,
  remintProject,
  replaceProject,
  type ConvertedProject,
  type ImportTarget,
  type PreviewRow,
} from '@repo/microtask-domain'
import type { ApiDeps } from '../../../deps.js'
import { PRODUCT } from '../product.js'
import { landedOutcome, refusedOutcome, type ProjectOutcome } from './apply-outcome.js'

/** How one project's application reaches the live target, which a remint has to re-read. */
export interface ChoiceContext {
  readonly row: PreviewRow
  readonly choice: ConflictChoiceValue | null
  readonly target: () => Promise<ImportTarget>
}

/**
 * Writes one project: its tokens into the index, then the project itself, whole.
 *
 * `TokenIndex.add` and `ProjectStore.publishProject`, which are ports and take no lock — a confirm
 * holds one `lock.run` around its whole apply, and `QueueLock` is not reentrant, so a `*Service`
 * here would leave `#chain` on a promise that never settles and hang every later write in the
 * process. That is why the index is written through `TokenIndex.add` rather than
 * `ShareLinkService.create`, which independently matters: a service write stamps `updatedAt`, and
 * import writes the timestamps a bundle carries and stamps nothing (design §7.4).
 *
 * **The index is written first, and the order is load-bearing.** `ShareIndex.add` refuses a token
 * another project holds by throwing, and it throws before it mutates. The other order has a far
 * worse failure: the project would already be on disk carrying a token a second project also
 * holds, and `warmTokenIndex` calls `add` once per manifest, awaited before `serve()` with no
 * `catch` — so the next container restart would never open a socket. This way a refused token
 * means nothing was written for that project and the index is untouched.
 *
 * That refusal is **reachable, and the preview cannot predict it.** `carriers()` in `checks.ts`
 * builds the in-session token map from the drops' *original* links, so a token minted by a remint
 * earlier in the same confirm is never checked against a project later in it. An id generator
 * that repeats a token therefore lands the first project and refuses the second with
 * `Conflict`, as a test beside this pins. In production the case is theoretical — a freshly
 * minted ULID token colliding with one a bundle carries is negligible — but the ordering is what
 * decides whether it is one refused row or a container that will not boot.
 *
 * The residue when the **publish** fails after the index was written is an index entry ahead of
 * disk, and it is inert rather than merely harmless: `PrincipalResolver.resolve` reads the link
 * off the manifest on every request, so an index hit whose manifest has no such token resolves to
 * no principal at all (measured: 401 `unknown_principal`). That is also what covers the case a
 * 404 would not — a `replace` whose publish fails *before* the destination is cleared, where the
 * index now maps the bundle's tokens onto a project that is still live and still serving its own.
 * The manifest re-read is why those tokens open nothing. Either way the index is rebuilt from
 * disk at the next restart.
 */
export async function writeProject(deps: ApiDeps, project: ConvertedProject): Promise<void> {
  deps.tokens.add(PRODUCT, project.manifest)
  await deps.store.publishProject(PRODUCT, project)
}

/**
 * Imports the project **as new**: a fresh project id, fresh task ids, fresh tokens, re-checked.
 *
 * The re-check is required, and a replace's absence of one is equally required. A remint rewrites
 * the incoming project and takes a new project id, so `checkImport` has to see it again — which is
 * what `DroppedProject`'s `'converted'` shape exists for — and two of its checks can only answer
 * on the reminted value: a `scope.taskId` that resolved before is carried through unchanged rather
 * than repaired, and `projectsPerProduct` counts a project that adds one where the colliding id it
 * arrived with would not have.
 *
 * The target is re-read for it, because earlier projects in this same session have already landed
 * inside this lock and that cap is measured against what is on disk **plus** this import.
 *
 * `shareLinksReminted` is a count and never the tokens. `remintProject` returns only the reminted
 * project and no old-to-new map — link order, names, roles and stamps are preserved, so pairing an
 * input link with its output is by index — and a share URL is a credential that does not travel in
 * a response (ADR 0033). So the count is the whole of what "N share links got new URLs" can say.
 */
export async function importAsNew(
  deps: ApiDeps,
  project: ConvertedProject,
  at: ChoiceContext,
): Promise<ProjectOutcome> {
  const reminted = remintProject(project, deps.ids)
  const drop = { shape: 'converted', path: at.row.path, converted: reminted } as const
  const [checked] = checkImport([drop], await at.target())
  if (checked === undefined || checked.outcome !== 'importable') {
    return { ...refusedOutcome(at.row, at.choice), reasons: checked?.reasons ?? at.row.reasons }
  }
  await writeProject(deps, reminted)
  const created = landedOutcome(at.row, at.choice, reminted, 'created')
  return { ...created, shareLinksReminted: reminted.manifest.shareLinks.length }
}

/**
 * Replaces the project this one collides with, keeping the identity both share.
 *
 * `current` is read at **`incoming.manifest.id`** and nowhere else. `replaceProject` reads it only
 * for its share links and task ids and writes `incoming`'s id either way, and nothing inside it
 * enforces that the two are the same project — so handed the manifest of the row, the session, or
 * the collision flag the preview computed earlier, any of which can have moved by the time this
 * lock is held, it would write the bundle's project while reporting *another* project's tasks as
 * removed and merging that project's links into this one.
 *
 * A collision that is no longer there is a plain create rather than a refusal: the store is read
 * inside the lock, so `null` here means the project the admin chose `replace` for is gone, and
 * writing the bundle is what they asked for.
 *
 * **Nothing re-checks the result, and that is not an omission.** A replace adds nothing the
 * preview did not already check, and re-checking it would be *wrong* rather than redundant: scope
 * containment is an import guard and not a store invariant, so applying it to a link kept from
 * disk would refuse a link this store validated when it was minted, over a task the admin has just
 * chosen to drop. What that costs is reported instead — `shareLinksStranded` — and the state is
 * not even new: `TaskService.remove` rebuilds the manifest as `{...current, tasks, updatedAt}` and
 * leaves `shareLinks` alone, so any `manage` holder deleting a task strands a scope the same way.
 *
 * `tasksRemoved` cannot be read off the resulting manifest, which is why it is reported here: a
 * project built whole and moved into place drops those files by construction, so the count is the
 * only record that they went.
 */
export async function importAsReplacement(
  deps: ApiDeps,
  project: ConvertedProject,
  at: ChoiceContext,
): Promise<ProjectOutcome> {
  const current = await deps.store.readManifest(PRODUCT, project.manifest.id)
  if (current === null) {
    await writeProject(deps, project)
    return landedOutcome(at.row, at.choice, project, 'created')
  }
  const replacement = replaceProject(project, current)
  await writeProject(deps, replacement.project)
  return {
    ...landedOutcome(at.row, at.choice, replacement.project, 'replaced'),
    tasksRemoved: replacement.removedTaskIds.length,
    shareLinksStranded: replacement.strandedTaskScopes.length,
  }
}
