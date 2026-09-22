import {
  LIMITS,
  MAX_PREVIEW_REASONS,
  MAX_PREVIEW_TEXT_LENGTH,
  type ImportCountKey,
} from '@repo/contracts'
import { elideMiddle, LONGEST_QUOTED_PATH } from './sniff.js'

const LONGEST_ID = 40

const LISTED_IDS = 3

const LOCATED_ISSUES = 3

const THE_FILE = 'the file itself'

const BOUNDS: Readonly<Record<ImportCountKey, string>> = {
  tasksPerProject: 'tasks',
  foldersPerProject: 'folders',
  shareLinksPerProject: 'share links',
  tabsPerTask: 'tabs',
  projectsPerProduct: 'projects',
}

/**
 * Quotes a path for a reason, with its middle elided if it is long.
 *
 * `normaliseImportPath` admits a path far longer than `ImportPreviewGroup.path`'s 200 characters,
 * deliberately, so a reason quoting one has to shorten it — and the **middle** goes because a
 * path's tail is the half that identifies it: the ULID of the project directory, the task file's
 * own name. That is the split Task 2 settled between eliding a path and eliding a value, and both
 * the operation and its **width** come from `sniff.ts` rather than being chosen again here: a
 * classifier's reason and a check's reason land in the same preview table, beside each other, and
 * one path quoted at two widths in one table would be arbitrary to every reader of it.
 */
export const quotedPath = (value: string): string => `"${elideMiddle(value, LONGEST_QUOTED_PATH)}"`

/**
 * Quotes an id for a reason, with its middle elided if it is long.
 *
 * An id this module refuses is an id the **drop** chose, so it is bounded by nothing: a hostile
 * `project.json` can carry four thousand characters where a ULID belongs. It is quoted at all —
 * unlike a token, which is never echoed — because an id is not a credential and an admin cannot
 * find the entry that was refused without seeing it.
 */
export const quotedId = (value: string): string => `"${elideMiddle(value, LONGEST_ID)}"`

/**
 * Names a few ids and counts the rest, so one reason still fits a preview row.
 *
 * A cross-check over a 500-task project can have hundreds of ids on either side of the difference,
 * and `ImportPreviewGroup.reasons` bounds each reason at 200 characters. Naming three and counting
 * the remainder keeps the reason actionable — an admin greps the archive for one of them — and
 * keeps the reason inside that bound for every id this product writes, a ULID being 26 characters.
 * It is not a guarantee: three ids at {@link quotedId}'s own 40-character ceiling, a cross-check
 * prefix and " and N more" reach just past 200, so {@link fitted} still elides such a reason and
 * the cut can fall inside an id. That is the right order of preference — a hostile id is already
 * unusable, and the alternative is dropping the sentence around it.
 */
export function listed(ids: readonly string[]): string {
  const shown = ids.slice(0, LISTED_IDS).map(quotedId)
  const rest = ids.length - shown.length
  return rest > 0 ? `${shown.join(', ')} and ${String(rest)} more` : shown.join(', ')
}

function whereIn(issue: { readonly path: readonly PropertyKey[] }): string {
  const where = issue.path.map((step) => String(step)).join('.')
  return where === '' ? THE_FILE : where
}

/**
 * Names where a schema refused a file, by field path and not by message.
 *
 * The **path** and deliberately not zod's sentence, because several of the checks below refuse the
 * same values with their own wording, and a message quoting the bound would make those checks
 * untestable: a test asserting "the reason names the limit" would pass on the schema's message
 * alone, after the check that exists to say it had been deleted. So this locates the field and the
 * purpose-built reason beside it says what is wrong with it.
 *
 * A step is stringified rather than joined directly: a `symbol` key is impossible in parsed JSON,
 * but `Array.prototype.join` throws on one rather than skipping it, and this runs over input the
 * whole point of which is that nobody has checked it.
 *
 * An issue against the **whole file** carries an empty path, which is what a `project.json` holding
 * `null`, `[]` or a scalar produces, and it is named rather than left blank: a reason ending in a
 * bare colon reads as a bug in the importer to the one person who most needs to trust it.
 */
export const located = (issues: readonly { readonly path: readonly PropertyKey[] }[]): string =>
  issues.slice(0, LOCATED_ISSUES).map(whereIn).join(', ')

/** One reason when a check failed, and none when it did not, for spreading into a reason list. */
export const when = (broken: boolean, reason: string): readonly string[] => (broken ? [reason] : [])

/**
 * Says a collection is over one of `LIMITS`' bounds, or says nothing.
 *
 * The bound is read from `LIMITS` rather than checked by `assertWithin`, which answers the other
 * question: `assertWithin` asks "may one more be added?" and answers by **throwing**, where a
 * preview has to ask "is what arrived already over?" and answer without throwing — §7.3 needs
 * every problem described at once, and a throw would end an upload with nine other directories
 * left to describe. The numbers come from the same place either way, so the bound import refuses at
 * and the bound `ProjectService.create` compares against cannot drift.
 */
export const overBound = (key: ImportCountKey, count: number, whose: string): readonly string[] =>
  when(
    count > LIMITS[key],
    `${whose} holds ${String(count)} ${BOUNDS[key]} — the limit is ${String(LIMITS[key])}`,
  )

/**
 * Holds a project's reasons to what `ImportPreviewGroup` will store: each elided, the list capped.
 *
 * Both bounds are the schema's, and both are applied **here** rather than downstream for the reason
 * Task 2 settled for classifier reasons: a reason arrives pre-elided, so a second elision cannot
 * cut text that has already been cut once. The last reason is spent saying how many were dropped,
 * because a project failing more ways than `MAX_PREVIEW_REASONS` is not one an admin imports on the
 * strength of the first nineteen — what still matters is that there were more.
 */
export function fitted(reasons: readonly string[]): readonly string[] {
  const short = reasons.map((reason) => elideMiddle(reason, MAX_PREVIEW_TEXT_LENGTH))
  if (short.length <= MAX_PREVIEW_REASONS) return short
  const rest = short.length - MAX_PREVIEW_REASONS + 1
  return [...short.slice(0, MAX_PREVIEW_REASONS - 1), `and ${String(rest)} more problems`]
}
