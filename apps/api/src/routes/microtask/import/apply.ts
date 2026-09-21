import type { ConflictChoiceValue } from '@repo/contracts'
import { Conflict, Invalid } from '@repo/kernel'
import { planImport, type ImportTarget, type PlannedProject } from '@repo/microtask-domain'
import type { ApiDeps } from '../../../deps.js'
import { PRODUCT } from '../product.js'
import type { ProjectOutcome } from './apply-outcome.js'
import { applyProject } from './apply-project.js'
import { discardSession, readStagedFiles } from './session-files.js'

/** One project and the conflict choice the admin made for it. */
export interface ProjectChoice {
  readonly projectId: string
  readonly choice: ConflictChoiceValue
}

/** What one confirm did, project by project. */
export interface AppliedImport {
  readonly sessionId: string
  readonly projects: readonly ProjectOutcome[]
}

const unknownProject = (ids: readonly string[]): string =>
  `This session stages no project with id ${ids.join(', ')}, so there is no group for that choice to address. Preview the session again and choose against the ids it reports.`

const unchosen = (ids: readonly string[]): string =>
  `A project already in this workspace needs a conflict choice before it can be imported, and these have none: ${ids.join(', ')}. Preview the session again — the store changed since the plan you confirmed — and choose skip, new or replace for each.`

/**
 * What the target store holds, as the preview checks have to be able to see it.
 *
 * Exported because the preview runs the same builder over the same target and a second reading of
 * "what is on disk" would be free to disagree with this one. `projectIds` serves two checks at
 * once — `existsInTarget` on every row, and `projectsPerProduct` measured against disk plus this
 * import — and `tokens` is the only thing that can see a share token already on disk.
 */
export const importTarget = async (deps: ApiDeps): Promise<ImportTarget> => ({
  product: PRODUCT,
  tokens: deps.tokens,
  projectIds: (await deps.store.listManifests(PRODUCT)).map((one) => one.id),
})

const heldIds = (planned: readonly PlannedProject[]): ReadonlySet<string> =>
  new Set(planned.flatMap((one) => (one.row.projectId === null ? [] : [one.row.projectId])))

/**
 * Resolves the admin's sparse choices against what the session actually stages.
 *
 * Two refusals, answered differently because the remedies differ. A choice naming a project the
 * session does **not** hold is an `Invalid` — a 422, a malformed request, and this is the only
 * thing that can see it: `ImportConfirmRequest` refuses two choices for one project and
 * `ImportPreview` guarantees one group per id, but neither schema knows what was staged.
 *
 * A project that is importable and **already in the target store** with no choice is a `Conflict`
 * — a 409. The request was well formed and the store changed under it, which is reachable exactly
 * because a preview takes no lock: another admin can create a project between the plan and the
 * confirm. Guessing is not available. `skip`, `new` and `replace` differ in whether the URLs
 * already in clients' hands keep working (ADR 0019), so a default would silently either destroy a
 * live project or leave the import half done.
 *
 * Only an **importable** row needs one. A blocked row is not written whatever is chosen for it, so
 * demanding a choice for it would refuse a confirm over a project that was never going to land.
 *
 * @throws Invalid naming every choice that addresses no staged project.
 * @throws Conflict naming every colliding project left without one.
 */
export function resolveChoices(
  planned: readonly PlannedProject[],
  choices: readonly ProjectChoice[],
): ReadonlyMap<string, ConflictChoiceValue> {
  const held = heldIds(planned)
  const strangers = choices.filter((one) => !held.has(one.projectId)).map((one) => one.projectId)
  if (strangers.length > 0) throw new Invalid(unknownProject(strangers))
  const chosen = new Map(choices.map((one) => [one.projectId, one.choice]))
  const missing = planned
    .filter((one) => one.row.outcome === 'importable' && one.row.existsInTarget)
    .flatMap((one) => (one.row.projectId === null ? [] : [one.row.projectId]))
    .filter((id) => !chosen.has(id))
  if (missing.length > 0) throw new Conflict(unchosen(missing))
  return chosen
}

/**
 * Applies one staged session under the choices given, and reports what became of each project.
 *
 * **One `lock.run`, around the whole apply, and nothing inside it takes the lock again.** Every
 * mutating service method takes the same lock and `QueueLock` is a single promise chain, so an
 * inner `run` chains onto a promise that settles only when the outer work returns while the outer
 * work awaits the inner one. The result is not a slow import: `#chain` is left pointing at a
 * promise that never settles, so **every subsequent write anywhere in the process hangs forever**
 * while reads and `/healthz` keep answering 200. So this reaches only `store`, `tokens` and
 * `fileSystem` — ports, none of which locks — and never a `*Service`, and it reads the session
 * through `session-files.ts` rather than through `ImportStaging`, whose every public method takes
 * the lock itself.
 *
 * Measured against this suite, and the two shapes fail differently, which is worth knowing before
 * trusting a green run: an **awaited** nested `run` never returns, so the confirm never answers
 * and 52 of 78 cases die on vitest's own five-second timeout — no assertion in any of them ever
 * executes. An **unawaited** one wedges nothing and is named by exactly one assertion, the
 * counting-lock case, which reports 4 where 1 is expected. So the lock count is the guard here;
 * a race on a later write cannot be, because it is never reached.
 *
 * One lock rather than one per project is also what the lost-update hazard needs. Both sides
 * read-modify-write the same manifest: `TabService.writeDocument` reloads it to refresh the
 * progress cache, and a `replace` reads the live manifest to merge in the share links the bundle
 * does not mention. Interleave those and one of the two writes is silently gone — not corrupt,
 * which `writeTextAtomic` prevents by renaming a temp file, but lost.
 *
 * The plan is built **again here**, inside the lock, rather than carried over from the preview.
 * Two of its checks read the target store — token uniqueness and `projectsPerProduct` — and a
 * concurrent write may have landed since; a preview that was authoritative would be a preview a
 * second admin could invalidate.
 *
 * **The session is swept once the apply begins, success or failure** (ADR 0045), and deliberately
 * not before. A choice set this refuses is answered before anything is written, so a 422 or a 409
 * leaves the upload staged to be confirmed again — where a failure *during* the apply cannot be
 * retried from the session, which is why every project's outcome is reported rather than summed
 * into a status.
 *
 * The cost of that ordering is stated rather than hidden: **the lock is held across the session
 * read and the plan, before either refusal can be reached**, so a confirm that goes on to write
 * nothing still stalls every write in the process for the length of a session read. It is
 * inherent rather than chosen — the refusals are decided from the plan, the plan is measured
 * against the target store, and reading the target outside the lock is exactly the staleness the
 * re-plan exists to remove. What bounds it is `MAX_SESSION_BYTES` and nothing else. Moving the
 * read outside would buy a faster refusal for a plan that could be wrong by the time it is used.
 *
 * @throws NotFound when the session id names nothing — expired, swept, or never opened.
 * @throws Invalid or Conflict for a choice set that cannot be applied, before anything is written.
 */
export async function applyImport(
  deps: ApiDeps,
  sessionId: string,
  choices: readonly ProjectChoice[],
): Promise<AppliedImport> {
  return deps.lock.run(async () => {
    const files = await readStagedFiles(deps, sessionId)
    const planned = planImport(files, await importTarget(deps), deps.clock)
    const chosen = resolveChoices(planned, choices)
    try {
      const projects: ProjectOutcome[] = []
      for (const one of planned) {
        const choice = one.row.projectId === null ? null : chosen.get(one.row.projectId) ?? null
        projects.push(await applyProject(deps, { planned: one, choice, target: () => importTarget(deps) }))
      }
      return { sessionId, projects }
    } finally {
      await discardSession(deps, sessionId)
    }
  })
}
