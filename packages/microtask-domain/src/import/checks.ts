import type { ImportOutcomeValue } from '@repo/contracts'
import { isUlid, type Product } from '@repo/kernel'
import type { TokenIndex } from '../ports/token-index.js'
import { prepareDrop, type DroppedProject, type Prepared } from './drop-checks.js'
import type { ConvertedProject } from './legacy.js'
import { projectReasons, type TokenCarriers } from './project-checks.js'
import { fitted, overBound, quotedId, quotedPath } from './refusal.js'

export type { DroppedDocument, DroppedProject } from './drop-checks.js'
export { overBound } from './refusal.js'

interface Session {
  readonly owners: TokenCarriers
  readonly claimed: Map<string, string>
  readonly onDisk: ReadonlySet<string>
  readonly target: ImportTarget
}

/**
 * What the target store already holds, as the checks have to be able to see it.
 *
 * Every field answers a disk question and is passed in rather than read, this group being pure —
 * §7.3's *nothing touches disk until confirmed*. `projectIds` is what `listManifests` returned and
 * serves two criteria at once: `existsInTarget` on every row, which is what lets the panel say the
 * sentence §7.4 requires before an admin chooses `new`; and the session's `projectsPerProduct`
 * bound measured against **disk plus this import** rather than against the drop alone, since two
 * confirms of 300 each would otherwise land 600.
 *
 * `tokens` is the only thing that can see a share token already on disk. `TokenIndex.collisions`
 * exists precisely so a caller can refuse a whole write before any of it lands, and it excludes
 * the project named — so a `replace` is not refused for carrying back the tokens it already owns.
 */
export interface ImportTarget {
  readonly product: Product
  readonly tokens: TokenIndex
  readonly projectIds: readonly string[]
}

/**
 * What the checks decided about one project, and what it would be written as.
 *
 * `outcome` excludes `error`: that member of `ImportOutcome` belongs to a group classification could
 * not read at all, which never reaches here. There is no third state either — a check that merely
 * warned would be a check an admin clicks past — so a project either imports or is refused with
 * every reason it failed for.
 *
 * `converted` is what would be written, non-null whenever conversion was possible: for a legacy
 * file always, for a v2 project once its manifest and documents have passed their schemas. It stays
 * populated on a **blocked** project, so a preview row can still report the counts it is refusing;
 * `outcome` is the field that says whether it may be written, and a caller writes only an
 * `importable` one.
 *
 * `projectId` is `null` for a project whose id this refused — one that is not a ULID, or one a
 * previous group already claimed — because it is the field a confirm reads back to address a
 * choice, and an id that was refused must not be addressable. The refused value is quoted in a
 * reason instead.
 *
 * `reasons` arrive **pre-elided and pre-capped**, inside `MAX_PREVIEW_TEXT_LENGTH` and
 * `MAX_PREVIEW_REASONS`, for the reason Task 2's classifier reasons do: a second elision
 * downstream would cut text that has already been cut once.
 */
export interface CheckedProject {
  readonly path: string
  readonly projectId: string | null
  readonly outcome: Exclude<ImportOutcomeValue, 'error'>
  readonly reasons: readonly string[]
  readonly converted: ConvertedProject | null
  readonly existsInTarget: boolean
}

function carriers(prepared: readonly Prepared[]): TokenCarriers {
  const owners = new Map<string, Set<string>>()
  for (const one of prepared) {
    const manifest = one.converted?.manifest
    if (manifest === undefined) continue
    for (const link of manifest.shareLinks) {
      const held = owners.get(link.token) ?? new Set<string>()
      held.add(manifest.id)
      owners.set(link.token, held)
    }
  }
  return owners
}

const claimedBefore = (at: string | undefined, path: string, id: string): readonly string[] =>
  at === undefined
    ? []
    : [`Project id ${quotedId(id)} was claimed by ${quotedPath(at)} before ${quotedPath(path)}`]

const refused = (path: string, reasons: readonly string[]): CheckedProject => ({
  path,
  projectId: null,
  outcome: 'blocked',
  reasons: fitted(reasons),
  converted: null,
  existsInTarget: false,
})

function judged(one: Prepared, session: Session): CheckedProject {
  const { converted, drop } = one
  if (converted === null) return refused(drop.path, one.reasons)
  const id = converted.manifest.id
  const claimed = session.claimed.get(id)
  const reasons = [
    ...one.reasons,
    ...claimedBefore(claimed, drop.path, id),
    ...projectReasons(converted, one.named, session.owners, session.target),
  ]
  session.claimed.set(id, claimed ?? drop.path)
  return {
    path: drop.path,
    projectId: isUlid(id) && claimed === undefined ? id : null,
    outcome: reasons.length === 0 ? 'importable' : 'blocked',
    reasons: fitted(reasons),
    converted,
    existsInTarget: session.onDisk.has(id),
  }
}

function capped(
  checked: readonly CheckedProject[],
  onDisk: ReadonlySet<string>,
): readonly CheckedProject[] {
  const adding = checked.filter(
    (one) => one.projectId !== null && one.outcome === 'importable' && !onDisk.has(one.projectId),
  )
  const whose = 'This import would leave a store that'
  const over = overBound('projectsPerProduct', onDisk.size + adding.length, whose)
  if (over.length === 0) return checked
  const blocked = new Set(adding)
  return checked.map((one) =>
    blocked.has(one)
      ? { ...one, outcome: 'blocked' as const, reasons: [...one.reasons, ...over] }
      : one,
  )
}

/**
 * Runs every blocking check §7.3 requires over one staged session, and says what will happen.
 *
 * Each **blocks** the project it fails and none of them throws. A warning is a check an admin
 * clicks past, and a throw would end an upload that has nine other directories left to describe —
 * so a project comes back carrying every reason it failed for at once, and a failure in one project
 * leaves the rest of the session alone.
 *
 * The one thing that is ordered is that **schema conformance runs first**: every check after it
 * reads `tasks`, `folders`, `shareLinks` and `tabs` off a converted project, and
 * `convertBundledProject` requires input a schema has already passed (Task 3), so a raw project
 * whose manifest or documents do not parse is refused with `converted: null` and never reaches the
 * converter. `drop-checks.ts` owns that one; `project-checks.ts` the six that read a converted
 * project and `link-checks.ts` the three that read a share link. The two below are the ones that
 * can only be answered across the **whole session**.
 *
 * A project id is claimed by at most one group, which is what `ImportPreview` requires and what a
 * confirm depends on: `ImportConfirmRequest` addresses a choice by `projectId`, so one id claimed
 * twice leaves no way to say which group the admin meant. The **first** group keeps the id and the
 * second is blocked carrying `projectId: null` and a reason naming both paths.
 *
 * `projectsPerProduct` is measured last, against what is on disk plus what this session would add,
 * because only a project that passed every other check will land. Exceeding it has a consequence
 * the other bounds do not: `ProjectService.create` compares against the same number, so an
 * over-cap import would silently disable project creation for the product. Every project that
 * would add one is blocked, since the drop is what has to shrink. The confirm has to run this again
 * inside the `QueueLock` it takes and after any reminting, both because a concurrent confirm may
 * have landed in between and because a project imported **as new** takes a fresh id and therefore
 * adds one where the colliding id it arrived with would not have.
 *
 * @returns one result per project, in the order they were given.
 */
export function checkImport(
  projects: readonly DroppedProject[],
  target: ImportTarget,
): readonly CheckedProject[] {
  const prepared = projects.map(prepareDrop)
  const session: Session = {
    owners: carriers(prepared),
    claimed: new Map<string, string>(),
    onDisk: new Set(target.projectIds),
    target,
  }
  return capped(
    prepared.map((one) => judged(one, session)),
    session.onDisk,
  )
}
