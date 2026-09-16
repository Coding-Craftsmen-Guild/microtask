import type { Decoded } from '@repo/api-client'
import type { ImportConfirmResult, ImportPreview } from '@repo/contracts'
import type { HarvestedFile } from '@repo/ui/transfer/vocabulary.js'
import type { DropOutcome, FileFailure } from './stage-drop'

/** The sentence a harvest that never finished leaves on screen. */
export const HARVEST_FAILED =
  'Microtask could not read everything that was dropped, so nothing has been staged. Nothing was uploaded — drop the folder again, or use the folder picker.'

/** The session a drop was staged into, and the plan for it. */
export interface StagedSession {
  /** The session a confirm will name. */
  readonly sessionId: string

  /** The plan, one row per dropped group. */
  readonly preview: Decoded<typeof ImportPreview>
}

/** One import attempt, whole: what was harvested, what was staged, and what a confirm did. */
export interface Attempt {
  /** What the last **successful** harvest carried. */
  readonly files: readonly HarvestedFile[]

  /** The staged session and its plan, or null before one has been read. */
  readonly session: StagedSession | null

  /** What a confirm did, or null before one has been made. */
  readonly result: Decoded<typeof ImportConfirmResult> | null

  /** Every file that did not make it into the session, named one by one. */
  readonly failures: readonly FileFailure[]

  /** One sentence about the drop as a whole, or null when there is nothing to say. */
  readonly notice: string | null

  /** Whether a call is in flight. */
  readonly busy: boolean

  /**
   * Whether a harvest **succeeded** and so there is an attempt to render a panel for.
   *
   * It is not `files.length > 0`, and that is the point: an empty folder is a legitimate drop
   * whose preview says so, while a harvest that *failed* also carries no files. Reading the two
   * off the same number is how a failed drop renders as "0 files harvested" and nothing else —
   * the empty success ADR 0018 was written about.
   */
  readonly harvested: boolean
}

/** Nothing dropped, nothing staged, nothing said. */
export const IDLE: Attempt = {
  files: [],
  session: null,
  result: null,
  failures: [],
  notice: null,
  busy: false,
  harvested: false,
}

/**
 * A fresh attempt over a harvest that succeeded.
 *
 * Every field is reset rather than merged, because a second drop after a refusal must not be
 * read against the first one's table: a preview row left on screen belongs to files that are no
 * longer staged, and its session has been swept.
 *
 * @param files - What the harvest carried, which may legitimately be none.
 * @returns The attempt to render while the drop is staged.
 */
export const harvesting = (files: readonly HarvestedFile[]): Attempt => ({
  ...IDLE,
  files,
  harvested: true,
  busy: true,
})

/**
 * The attempt after a harvest that **failed**, which stages nothing and says so.
 *
 * `harvested` is false and `files` is empty, so nothing renders a panel over a drop that was
 * never read. The reason is appended to the sentence rather than replacing it: the sentence says
 * what happened and what to do, and the reason is what an operator quotes in a bug report.
 *
 * @param reason - Whatever the harvest rejected with.
 * @returns The attempt to render, carrying one alert and no table.
 */
export const harvestRefused = (reason: unknown): Attempt => ({
  ...IDLE,
  notice: `${HARVEST_FAILED} (${String(reason)})`,
})

/**
 * The attempt after a staging run settled: a plan with its per-file failures, or one sentence.
 *
 * A drop that could not be staged or previewed at all clears `harvested`, so the console shows
 * the sentence in place of an empty table rather than beside one.
 *
 * @param current - The attempt as it stands.
 * @param outcome - What `stageDrop` answered.
 * @returns The attempt to render.
 */
export const stagedInto = (current: Attempt, outcome: DropOutcome): Attempt =>
  outcome.ok
    ? {
        ...current,
        busy: false,
        session: { sessionId: outcome.sessionId, preview: outcome.preview },
        failures: outcome.failures,
      }
    : { ...current, busy: false, harvested: false, session: null, notice: outcome.detail }

/**
 * The attempt after a confirm landed, keeping the preview beside the result.
 *
 * The plan stays on screen because the result is joined to it by `path`: a result table with no
 * preview above it cannot be read against what was dropped.
 *
 * @param current - The attempt as it stands.
 * @param result - What the confirm did, project by project.
 * @returns The attempt to render.
 */
export const applied = (
  current: Attempt,
  result: Decoded<typeof ImportConfirmResult>,
): Attempt => ({ ...current, busy: false, result })

/**
 * The attempt after any call answered a refusal, or threw where a refusal was expected.
 *
 * It keeps whatever was already staged. A confirm that was refused leaves the plan readable so
 * the admin can change a choice and try again, and the session is still there until the apply
 * begins (ADR 0045).
 *
 * @param current - The attempt as it stands.
 * @param detail - The sentence to show.
 * @returns The attempt to render.
 */
export const said = (current: Attempt, detail: string): Attempt => ({
  ...current,
  busy: false,
  notice: detail,
})
