import {
  MAX_PREVIEW_TEXT_LENGTH,
  type ConflictChoiceValue,
  type ImportWriteOutcomeValue,
} from '@repo/contracts'
import { AppError } from '@repo/kernel'
import { elideMiddle, type ConvertedProject, type PreviewRow } from '@repo/microtask-domain'

const WRITE_FAILED =
  'This project could not be written. The project that was already in this workspace, if any, is untouched. See the server log for what the volume reported.'

/** One project a confirm handled, and what became of it, as the response reports it. */
export interface ProjectOutcome {
  readonly path: string
  readonly projectId: string | null
  readonly writtenProjectId: string | null
  readonly choice: ConflictChoiceValue | null
  readonly outcome: ImportWriteOutcomeValue
  readonly tasksWritten: number
  readonly tasksRemoved: number
  readonly shareLinksReminted: number
  readonly shareLinksStranded: number
  readonly reasons: readonly string[]
}

/**
 * A project nothing was written for, carrying the reasons the plan gave it.
 *
 * Also the base every other outcome is spread from, so a field added to {@link ProjectOutcome} has
 * one place to get its zero value and cannot be left undefined on one of five paths. `blocked`
 * covers a row the checks refused **and** a group classification could not read at all: both mean
 * nothing was attempted and the drop is what has to change, which is the distinction the response
 * is for — `ImportWriteOutcome` has no `error` member, the preview's row already having said which
 * it was.
 */
export const refusedOutcome = (
  row: PreviewRow,
  choice: ConflictChoiceValue | null,
): ProjectOutcome => ({
  path: row.path,
  projectId: row.projectId,
  writtenProjectId: null,
  choice,
  outcome: 'blocked',
  tasksWritten: 0,
  tasksRemoved: 0,
  shareLinksReminted: 0,
  shareLinksStranded: 0,
  reasons: row.reasons,
})

/**
 * A project whose write was attempted and did not complete, carrying what an operator may see.
 *
 * **This is the boundary between what a response says and what the process log keeps, and the
 * rule is the error's class.** An `AppError` is the kind this repo writes *for a caller to read*
 * — `Conflict` from `ShareIndex.add` naming the projects that share a token, and the `Conflict`
 * `FsProjectStore.publishProject` raises when a rename failed after the destination was cleared,
 * which names `build/<id>/` because that copy is the recovery and an operator has to be told. So
 * an `AppError`'s message is echoed. Anything else is a fault, its message is the platform's, and
 * quoting it would put an absolute container path in a response — `EPERM: … rename
 * 'C:\\srv\\data\\microtask\\build\\…'`. Those get a fixed sentence and the cause is logged
 * instead, which is the same split `session-files.ts` makes when it declines to let `EMFILE`
 * reach a client quoting an internal path.
 *
 * Admin authority is not the reason either way. Gating this route on `workspace:import` is what
 * makes the disclosure small, not what makes it wanted: a `failed` row is rendered into an admin
 * page and a volume's error string is not something that page can act on, where the build
 * directory is.
 *
 * The log line is the one side effect in this module and it is deliberate — this is the only place
 * that holds the raw error. `cause` is unwrapped because `publishProject` attaches the platform's
 * rejection there rather than quoting it. The fallback sentence also satisfies
 * `ImportProjectResult`, which refuses a `failed` row with no reason: a throw carrying an empty
 * message would otherwise produce a response the schema rejects, turning one project's failure
 * into a 500 for the whole confirm.
 */
export const failedOutcome = (
  row: PreviewRow,
  choice: ConflictChoiceValue | null,
  error: unknown,
): ProjectOutcome => {
  const shown = error instanceof AppError && error.message !== '' ? error.message : WRITE_FAILED
  const cause = error instanceof Error ? (error.cause ?? error) : error
  console.warn(
    JSON.stringify({
      event: 'microtask.import.project.failed',
      path: row.path,
      projectId: row.projectId,
      reason: cause instanceof Error ? cause.message : String(cause),
    }),
  )
  return {
    ...refusedOutcome(row, choice),
    outcome: 'failed',
    reasons: [elideMiddle(shown, MAX_PREVIEW_TEXT_LENGTH)],
  }
}

/**
 * A project that landed, named by the id it landed **under** rather than the id it was chosen by.
 *
 * Those differ for exactly one choice. A remint takes a fresh project id, so an `import as new` is
 * the case where the id the admin decided against is not the id on disk afterwards — and a
 * response carrying only one of the two would leave them unable to find what they just imported.
 */
export const landedOutcome = (
  row: PreviewRow,
  choice: ConflictChoiceValue | null,
  project: ConvertedProject,
  outcome: ImportWriteOutcomeValue,
): ProjectOutcome => ({
  ...refusedOutcome(row, choice),
  writtenProjectId: project.manifest.id,
  outcome,
  tasksWritten: project.documents.length,
  reasons: [],
})
