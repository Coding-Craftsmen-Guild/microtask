import {
  MAX_PREVIEW_TEXT_LENGTH,
  type ConflictChoiceValue,
  type ImportWriteOutcomeValue,
} from '@repo/contracts'
import { elideMiddle, type ConvertedProject, type PreviewRow } from '@repo/microtask-domain'

const WRITE_FAILED = 'The write did not complete'

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
 * A project whose write was attempted and did not complete, carrying what went wrong.
 *
 * The message is the thrown error's, elided to the width a row may carry, and the fallback exists
 * because `ImportProjectResult` refuses a `failed` row with no reason: a throw carrying an empty
 * message would otherwise produce a response the schema rejects, turning one project's failure
 * into a 500 for the whole confirm.
 */
export const failedOutcome = (
  row: PreviewRow,
  choice: ConflictChoiceValue | null,
  error: unknown,
): ProjectOutcome => {
  const why = error instanceof Error && error.message !== '' ? error.message : WRITE_FAILED
  return {
    ...refusedOutcome(row, choice),
    outcome: 'failed',
    reasons: [elideMiddle(why, MAX_PREVIEW_TEXT_LENGTH)],
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
