import type { ConflictChoiceValue } from '@repo/contracts'
import type { ImportTarget, PlannedProject } from '@repo/microtask-domain'
import type { ApiDeps } from '../../../deps.js'
import { importAsNew, importAsReplacement, writeProject } from './apply-choice.js'
import { failedOutcome, landedOutcome, refusedOutcome, type ProjectOutcome } from './apply-outcome.js'

/** What applying one project needs: the plan's row, the choice for it, and the live target. */
export interface Application {
  readonly planned: PlannedProject
  readonly choice: ConflictChoiceValue | null
  readonly target: () => Promise<ImportTarget>
}

/**
 * Applies one planned project and says what became of it, **never throwing**.
 *
 * A failure is caught per project and reported as a `failed` row, because cross-project atomicity
 * is not claimed: a drop is many independent projects, a failure on the seventh is no reason to
 * discard the six that landed, and re-running is not an option — the session is swept on confirm
 * either way (ADR 0045). So the six that landed are reported as landed and the seventh carries the
 * reason it did not.
 *
 * A row that is not `importable` is not attempted at all and keeps the reasons the plan gave it.
 * `skip` is the admin's own choice rather than a failure, and is the one outcome with neither a
 * write nor a reason.
 *
 * A choice is honoured whether or not the project collided, because all three mean something
 * without a collision — `skip` leaves it out, `new` gives it a fresh identity, `replace` with
 * nothing to replace is a create — and a choice silently ignored is the worse answer. Which is
 * also why `resolveChoices` refuses a choice naming a project the session does not hold rather
 * than dropping it.
 */
export async function applyProject(deps: ApiDeps, one: Application): Promise<ProjectOutcome> {
  const { row, project } = one.planned
  const at = { row, choice: one.choice, target: one.target }
  if (row.outcome !== 'importable' || project === null) return refusedOutcome(row, one.choice)
  if (one.choice === 'skip') {
    return { ...refusedOutcome(row, one.choice), outcome: 'skipped', reasons: [] }
  }
  try {
    if (one.choice === 'new') return await importAsNew(deps, project, at)
    if (one.choice === 'replace') return await importAsReplacement(deps, project, at)
    await writeProject(deps, project)
    return landedOutcome(row, one.choice, project, 'created')
  } catch (error) {
    return failedOutcome(row, one.choice, error)
  }
}
