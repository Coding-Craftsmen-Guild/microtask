import { z } from 'zod'
import { EntityId } from './document.js'
import { ConflictChoice, MAX_PREVIEW_REASONS, MAX_PREVIEW_TEXT_LENGTH } from './import-plan.js'

/**
 * What a confirm did with one project: it landed, it was passed over, or it did not land.
 *
 * Five members rather than a boolean, because the four non-successes are acted on differently.
 * `created` and `replaced` are both writes and differ in what happened to the project that was
 * there — which is the one fact an admin needs to check afterwards. `skipped` is the admin's own
 * `skip` choice and is not a failure. `blocked` is a preview check refusing the project, so
 * nothing was attempted and the drop is what has to change. `failed` is a write that was
 * attempted and did not complete, which is the one that may need a look at the volume.
 */
export const ImportWriteOutcome = z
  .enum(['created', 'replaced', 'skipped', 'blocked', 'failed'])
  .meta({ id: 'ImportWriteOutcome', description: 'What a confirm did with one project' })

const projectResultFields = z.object({
  path: z.string().max(MAX_PREVIEW_TEXT_LENGTH),
  projectId: EntityId.nullable(),
  writtenProjectId: EntityId.nullable(),
  choice: ConflictChoice.nullable(),
  outcome: ImportWriteOutcome,
  tasksWritten: z.number().int().min(0),
  tasksRemoved: z.number().int().min(0),
  shareLinksReminted: z.number().int().min(0),
  shareLinksStranded: z.number().int().min(0),
  reasons: z.array(z.string().max(MAX_PREVIEW_TEXT_LENGTH)).max(MAX_PREVIEW_REASONS).readonly(),
})

const landed = (result: {
  readonly outcome: z.infer<typeof ImportWriteOutcome>
  readonly reasons: readonly string[]
}): boolean =>
  result.outcome === 'blocked' || result.outcome === 'failed'
    ? result.reasons.length > 0
    : result.reasons.length === 0

/**
 * One project a confirm handled, and what became of it.
 *
 * `path` and `projectId` are the **preview row's**, so a client joins this list to the table it
 * rendered and to the choice it sent. `writtenProjectId` is where the project actually landed and
 * is the same id except after a remint, which takes a fresh one: an `import as new` is precisely
 * the case where the id the admin chose against is not the id on disk afterwards, and a response
 * carrying only one of the two would leave the admin unable to find what they just imported. It
 * is `null` when nothing was written, which is every outcome but `created` and `replaced`.
 *
 * `choice` is the choice that was applied and `null` when the project needed none. It is echoed
 * rather than left implied because a confirm can apply a choice the admin did not make against
 * this project in their head — `choices` is sparse, and a project that collided only *after* the
 * preview was taken is refused rather than guessed at, so the ones that are here are the ones the
 * request named.
 *
 * The four counts are what §7.4 requires an admin be able to check afterwards, and each is a
 * number rather than a list for a different reason. `tasksWritten` is the project's own task
 * count. `tasksRemoved` is `Replacement.removedTaskIds`, which cannot be read off the resulting
 * manifest — a project built whole and moved into place drops those files by construction, so if
 * the count is not reported it is not recoverable. `shareLinksReminted` is the "N share links will
 * get new URLs" sentence, now in the past tense: the URLs themselves are credentials and never
 * travel in a response (ADR 0033), so the count is the whole of what can be said. And
 * `shareLinksStranded` is `Replacement.strandedTaskScopes` — links kept from disk whose task the
 * admin has just chosen to drop, which 404 from now on and are reported rather than revoked.
 *
 * `reasons` carries every reason a `blocked` or `failed` project did not land and is empty for the
 * three outcomes that are not failures, checked here so neither a silent refusal nor an explained
 * success can be built. Bounded exactly as a preview row's reasons are, and for the same reason.
 */
export const ImportProjectResult = projectResultFields
  .refine(landed, { error: 'a project that did not land has to say why', path: ['reasons'] })
  .meta({ id: 'ImportProjectResult', description: 'One project a confirm handled, and what became of it' })

/**
 * What one confirm did, project by project.
 *
 * **Cross-project atomicity is not claimed, and this shape is the reason it does not have to be.**
 * A drop is many independent projects; a failure on the seventh is not grounds for discarding the
 * six that landed, and re-running the import is not an option either — the session is swept on
 * confirm, success or failure (ADR 0045). So every project gets a row saying which of the two it
 * was, and an admin acts on the rows that did not land rather than on a single status.
 *
 * Which is also why the route answers **200** with failures in the body rather than a 4xx or 5xx:
 * a status is one word about the whole request, and there is no word that is true of a confirm
 * where eight projects were created and one could not be. A request that fails as a whole — an
 * unknown session, a choice naming a project the session does not hold, a collision with no choice
 * — never reaches this shape and is refused with a problem document instead.
 *
 * `projects` is **unbounded, for `ImportPreview`'s reason and to keep its promise.** There is
 * one row here per group the preview described, so a count bounded here would be the preview's
 * deliberate unboundedness refused one step later — and refused at the only moment nothing can be
 * re-run, the session having been swept as the apply began (ADR 0045). It was bounded by
 * `projectsPerProduct` until this was measured, on the claim that the preview refuses a bigger
 * drop first. It does not: `capped()` blocks a project that would take the store over that number
 * and still answers a row for it, so 501 groups preview as 501 rows (ADR 0017 — describe what was
 * dropped rather than refuse to describe it) and confirm as 501 outcomes. The API validates no
 * response, but `@repo/api-client`'s transport parses every one, so the bound turned an
 * over-the-cap confirm into a `ZodError` in place of the outcome list — after the writes had
 * landed, which the 501st row need not be one of: 498 importable projects and three unreadable
 * files is 501 rows and 498 projects on disk.
 *
 * What bounds the count instead is the same thing that bounds the preview's: `MAX_SESSION_BYTES`
 * and `MAX_ARCHIVE_ENTRIES` on what may be staged at all. Every row is bounded in each of its own
 * dimensions, so the count is the one dimension left open rather than ten — and the store's own
 * `projectsPerProduct` is enforced where it belongs, in the check that decides what may be
 * written, rather than in the report of what was.
 */
export const ImportConfirmResult = z
  .object({
    sessionId: EntityId,
    projects: z.array(ImportProjectResult).readonly(),
  })
  .meta({ id: 'ImportConfirmResult', description: 'What one confirm did, project by project' })

/** What a confirm did with one project, as a value rather than as a schema. */
export type ImportWriteOutcomeValue = z.infer<typeof ImportWriteOutcome>
