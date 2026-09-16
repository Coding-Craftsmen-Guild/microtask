import {
  MAX_PREVIEW_TEXT_LENGTH,
  type ImportOutcomeValue,
  type ImportShapeValue,
} from '@repo/contracts'
import type { Role, Scope } from '@repo/kernel'
import { checkImport, type CheckedProject, type ImportTarget } from './checks.js'
import { explodeGroup, type ExplodedProject, type ImportMint } from './exploded.js'
import type { ConvertedProject } from './legacy.js'
import { fitted } from './refusal.js'
import { elideMiddle, sniffImportFiles, type ImportFile } from './sniff.js'

export type { ImportMint } from './exploded.js'

/**
 * One share link a preview row reports, named by its index and never by its token.
 *
 * The structural twin of `@repo/contracts`' `ImportPreviewShareLink`, stated as an interface
 * because that is how this package states every shape it builds. **There is nowhere for a token
 * to sit**, which is the one property it exists to have: a preview is rendered into an admin page
 * and therefore into the Flight payload and the HTML, and a bundle may carry fifty links per
 * project (ADR 0033). `createdBy` is absent for the same reason — it is a token too.
 */
export interface PreviewShareLink {
  readonly index: number
  readonly name: string
  readonly role: Role
  readonly scope: Scope
}

/** One dropped group and what will happen to it, which is the row §7.3 renders. */
export interface PreviewRow {
  readonly path: string
  readonly shape: ImportShapeValue
  readonly projectId: string | null
  readonly name: string
  readonly manifestTaskCount: number | null
  readonly taskFilesFound: number
  readonly shareLinks: readonly PreviewShareLink[]
  readonly existsInTarget: boolean
  readonly outcome: ImportOutcomeValue
  readonly reasons: readonly string[]
}

/**
 * One planned project: the row a preview renders, and the project a confirm would write.
 *
 * `project` is populated whenever conversion was possible and stays populated on a **blocked**
 * row, so the row can still report the counts it is refusing. `row.outcome` is the field that
 * says whether it may be written, which is `CheckedProject`'s own rule carried forward — a
 * confirm writes an `importable` one and nothing else.
 */
export interface PlannedProject {
  readonly row: PreviewRow
  readonly project: ConvertedProject | null
}

const previewLinks = (project: ConvertedProject | null): readonly PreviewShareLink[] =>
  (project?.manifest.shareLinks ?? []).map((link, index) => ({
    index,
    name: link.name,
    role: link.role,
    scope: link.scope,
  }))

const shortPath = (path: string): string => elideMiddle(path, MAX_PREVIEW_TEXT_LENGTH)

const UNPAIRED = 'This group could not be paired with a checked project'

function unreadable(one: ExplodedProject, why = one.error): PlannedProject {
  return {
    row: {
      path: shortPath(one.path),
      shape: one.shape,
      projectId: null,
      name: '',
      manifestTaskCount: null,
      taskFilesFound: one.taskFilesFound,
      shareLinks: [],
      existsInTarget: false,
      outcome: 'error',
      reasons: fitted(why === null ? [UNPAIRED] : [why]),
    },
    project: null,
  }
}

function judged(one: ExplodedProject, checked: CheckedProject): PlannedProject {
  const { converted } = checked
  return {
    row: {
      path: shortPath(one.path),
      shape: one.shape,
      projectId: checked.projectId,
      name: converted?.manifest.name ?? '',
      manifestTaskCount: converted === null ? null : converted.manifest.tasks.length,
      taskFilesFound: one.taskFilesFound,
      shareLinks: previewLinks(converted),
      existsInTarget: checked.existsInTarget,
      outcome: checked.outcome,
      reasons: checked.reasons,
    },
    project: converted,
  }
}

/**
 * Plans a whole staged session: what was dropped, what will happen to it, and what would be written.
 *
 * The one function both halves of §7.3 run. A preview renders `row` and discards `project`; a
 * confirm runs this **again inside the lock it holds** and writes `project` for every `importable`
 * row. Running it twice is not a redundancy: `checkImport` measures token uniqueness and
 * `projectsPerProduct` against the target store, a concurrent write may have landed in between,
 * and a preview that was authoritative would be a preview a second admin could invalidate.
 *
 * Every group gets exactly one row unless it is a bundle, which gets one per project it carries —
 * `exploded.ts` states why. A group classification could not read is the `error` outcome and the
 * only one `checkImport` never sees, its input being projects.
 *
 * `path` is elided to `MAX_PREVIEW_TEXT_LENGTH` here and reasons are **not**: `normaliseImportPath`
 * admits a path far longer than a row may carry, deliberately, so shortening one is this builder's
 * job — while every reason arrives pre-elided from `sniff.ts` or `checks.ts`, and a second elision
 * would cut text that has already been cut once. The `fitted` call above applies to a classifier
 * error reaching a row for the first time, which is the one reason list nothing has capped.
 *
 * Nothing here throws except on a path no client may send: `sniffImportFiles` refuses a traversal
 * as `Invalid` and two files harvested for one path as `Conflict`. Every other problem is a row.
 *
 * `checkImport` answers one result per project in the order it was given, so the pairing below is
 * positional and cannot run short. It is written to produce a **row carrying a reason** if it ever
 * did rather than a row with none: `ImportProjectResult` refuses an unexplained refusal, so an
 * empty-reason row would turn a structurally unreachable case into a 500 for the whole confirm
 * instead of one degraded project.
 *
 * @throws Invalid naming which rule a harvested path broke.
 * @throws Conflict when two files were harvested for one normalised path.
 */
export function planImport(
  files: readonly ImportFile[],
  target: ImportTarget,
  mint: ImportMint,
): readonly PlannedProject[] {
  const exploded = sniffImportFiles(files).flatMap((group) => explodeGroup(group, mint))
  const drops = exploded.flatMap((one) => (one.drop === null ? [] : [one.drop]))
  const checked = checkImport(drops, target)
  let at = 0
  return exploded.map((one) => {
    if (one.drop === null) return unreadable(one)
    const found = checked[at]
    at += 1
    return found === undefined ? unreadable(one) : judged(one, found)
  })
}
