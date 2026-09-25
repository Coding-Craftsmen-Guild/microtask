import { effectiveBridgeRole, open, type Principal, type Role } from '@repo/kernel'
import type { EpicBinding, PlanEpic } from '@repo/macroplan-domain'
import type { Progress, ProjectManifest, ProjectStore, TaskService } from '@repo/microtask-domain'

/**
 * The product a project scope can only ever belong to.
 *
 * Hardcoded rather than read back off the token index, and it is derivable rather than assumed: a
 * `Scope` is `project`, `task` or `plan`, and `linkDirectories` builds a Macroplan principal's scope
 * as `{ kind: 'plan' }` unconditionally while only a Microtask manifest yields the project and task
 * variants. So a principal this file has already narrowed to a **project** scope came out of
 * Microtask's own directory, and there is no second product it could have come from.
 */
export const BOUND_PRODUCT = 'microtask'

/**
 * The delimiter joining the three parts of a deduplication key in {@link BridgeService.read}.
 *
 * A character none of the three parts can contain, which is what makes the key injective: a
 * `ShareToken` and a ULID are both restricted alphabets and a binding role is one of two words, so
 * no two different triples can join to one string and be treated as one project. A separator that
 * *could* appear in a part would let two bindings share a cached answer — quietly, and only for
 * whichever pair of tokens happened to collide.
 */
export const KEY_PART = '|'

/** What one linked task is worth to the bridge: the name only a cleared reader sees, and the count. */
export interface TaskFacts {
  readonly name: string
  readonly progress: Progress
}

/**
 * What an epic's binding resolves to **right now**, which is not what its manifest says.
 *
 * `'unlinked'` is one state with many causes — no binding, a blob that will not open, a revoked
 * token, a deleted project, a token that names another project — and design §7.2 requires exactly
 * that: "a revoked or dead token renders the epic unlinked — a stated state with its own appearance
 * — never an error page and never an empty canvas". A reader cannot act on the difference between
 * those causes and none of them is this product's fault to report, so they are one answer.
 *
 * `role` is already attenuated: the weaker of the role the binding declares and the role the token
 * actually holds in Microtask today (design §7.3, applied once here). Attenuating again for the
 * person reading the plan is `bridge-view.ts`'s job, and deliberately not this file's — see
 * {@link BridgeService}.
 */
export type BoundProject =
  | { readonly state: 'unlinked' }
  | {
      readonly state: 'bound'
      readonly projectId: string
      readonly role: Role
      readonly tasks: ReadonlyMap<string, TaskFacts>
    }

/**
 * Resolves a bearer to the principal it names, or to nobody at all.
 *
 * A one-method interface rather than `PrincipalResolver` itself, exactly as
 * `PrincipalResolverOptions.admin` takes `AdminTokens` rather than `AdminVerifier`: this file needs
 * the question answered and nothing else, and naming the class would let a later edit reach the rest
 * of it. `PrincipalResolver` satisfies this structurally, and it is the only implementation — which
 * matters, because it is what re-reads a link's role and scope from the manifest on **every** call
 * rather than caching it beside the token. That is the whole of "a revoked token renders unlinked":
 * revocation takes effect on the next read, not when a cache happens to expire.
 */
export interface Bearers {
  resolve(bearer: string): Promise<Principal | null>
}

/** Everything the bridge needs, every member a port or a narrow interface (ADR 0030). */
export interface BridgeServiceOptions {
  /** Opens a stored binding's sealed token. `ApiConfig.bridgeSecret`, and never a literal. */
  readonly secret: string

  /** Turns an opened token into the live principal it names. */
  readonly bearers: Bearers

  /** Microtask's store, read for the bound project's manifest — which carries every task's name and count. */
  readonly store: ProjectStore

  /** Microtask's task writer, reached by exactly one method below and by nothing else. */
  readonly tasks: TaskService
}

interface Live {
  readonly projectId: string
  readonly role: Role
}

/**
 * The one place in this API where Macroplan reads and writes Microtask.
 *
 * ### Two methods, and that is the security property
 *
 * Design §7.2 bounds a `manage` binding by promising the write path "permits **exactly one
 * operation** — create a task in the bound project. No delete, no rename of anything Macroplan did
 * not create, no share-link management." A promise in a document is not a bound; the bound is that
 * this class has one reader and one writer and `bridge-service.test.ts` asserts that surface by
 * name. A third method arriving here is a decision to record before it is code, and the failing test
 * is what makes somebody record it.
 *
 * ### What it refuses to know
 *
 * No method here takes the principal reading the *plan*. The bridge answers what a binding is worth,
 * and attenuating that for a particular reader is `bridge-view.ts`'s job. Keeping the two apart is
 * deliberate: this is the module that holds a live credential for the other product, and a plan's
 * role model has no business inside it — the day the two are mixed, a change to how a plan is shared
 * becomes a change to what a stored token can do.
 *
 * ### The admin credential it will not accept
 *
 * `resolve` answers `{ kind: 'admin' }` for an admin bearer, and `can()` answers **yes** to every
 * admin on every target, so an admin token pasted in as a binding would sail through every check
 * below and confer everything. Both methods therefore refuse a principal that is not a link. §7.2
 * opens by ruling this out — "Not an admin credential: the service key already fails to distinguish
 * products (shell design §3), and the bridge must not rest on that hole" — and `BindEpicPayload`
 * validating `ShareToken` is a format check on the way in, not a check on what a stored blob turns
 * out to hold. This is the check that does not depend on the shape of a string.
 *
 * ### Why it never calls `can()`
 *
 * `surface.test.ts` asserts that this app asks the policy in **exactly one place** — `auth/authorize.ts`
 * — "which is what makes a missing gate greppable". This file honours that, and it is not a compromise:
 * `authorize()` decides what the *request's* principal may do, reading it off the hono `Context`, and
 * the principal that matters here is the one a **stored token** names. There is no request to ask about,
 * so the app's one chokepoint structurally cannot express this question.
 *
 * What replaces it is a rule strictly **stricter** than the policy on both paths, which is the safe
 * direction to differ in. A read needs a project scope naming the bound project, where `project:read`
 * is in the `view` grant and would clear every link that got this far — so asking would have been a
 * tautology. A write needs an effective `manage`, where `task:create` is granted to `write` as well —
 * so asking would have *widened* what this bridge permits, against §7.2's "exactly one operation" for
 * a `manage` binding alone. Both `can()` calls were written here first and both were removed for being
 * checks that could not fail; do not add them back.
 *
 * ### The scope it requires
 *
 * A **project** scope, and not a task scope, though `can()` would clear a task-scoped token for
 * `project:read` (`TASK_SCOPE_PROJECT_ACTIONS`). §7.2 binds an epic to a project — "a project-scoped
 * token is one token per epic rather than one per item" — and a task-scoped token would bind an epic
 * to a single task's worth of a project, which is not a thing this product can render. The scope must
 * also name the project the binding stored, because the two coming apart proves the pair is wrong and
 * the safe reading of a wrong pair is unlinked rather than "trust the token".
 *
 * The test is `scope.kind === 'project'` and deliberately **not** `isProjectScope`, whose name reads
 * as though it were the same check and is not: that guard admits a task scope as well, meaning
 * "rooted at a project" rather than "is the project". It was written for the consumers that only need
 * a `projectId` to exist, and this is the one caller for which the difference is a hole — a rail bound
 * by a task-scoped token, which a test here pins.
 */
export class BridgeService {
  readonly #secret: string
  readonly #bearers: Bearers
  readonly #store: ProjectStore
  readonly #tasks: TaskService

  /** Creates the service over its injected collaborators. */
  constructor(options: BridgeServiceOptions) {
    this.#secret = options.secret
    this.#bearers = options.bearers
    this.#store = options.store
    this.#tasks = options.tasks
  }

  /**
   * What each of these epics is bound to right now, keyed by epic id — one entry per epic, always.
   *
   * Every failure answers `{ state: 'unlinked' }` and none throws, for the reason {@link BoundProject}
   * gives. A caller gets a total map, so a missing key is never a third state to interpret.
   *
   * **One read per distinct token, not one per epic.** Two epics bound to the same project through
   * the same token cost one `resolve` and one manifest read, which is worth having rather than tidy:
   * `LIMITS.epicsPerPlan` is 40, so an undeduplicated read of a fully bound plan would be forty
   * resolves and forty manifest reads on one request. Keyed by the **opened** token rather than by the
   * sealed blob, because `seal` uses a fresh IV per call and the same token sealed twice is two
   * different blobs — deduplicating on the stored value would never find a match.
   */
  async read(epics: readonly PlanEpic[]): Promise<ReadonlyMap<string, BoundProject>> {
    const answers = new Map<string, BoundProject>()
    const byToken = new Map<string, Promise<BoundProject>>()
    for (const epic of epics) {
      const token = epic.binding === null ? null : open(this.#secret, epic.binding.sealedToken)
      if (epic.binding === null || token === null) {
        answers.set(epic.id, { state: 'unlinked' })
        continue
      }
      const key = [token, epic.binding.projectId, epic.binding.role].join(KEY_PART)
      const pending = byToken.get(key) ?? this.#bound(token, epic.binding)
      byToken.set(key, pending)
      answers.set(epic.id, await pending)
    }
    return answers
  }

  /**
   * Creates one task in the bound project and answers its id. The only write this bridge permits.
   *
   * Refuses unless the binding resolves to an effective `manage`, which takes both halves: a rail the
   * admin bound at `view` can never write however strong its token is, and a rail bound at `manage`
   * whose token has since been downgraded in Microtask cannot either. `null` is the refusal rather
   * than a throw, so the route decides the status and owns the sentence — a service that threw
   * `Forbidden` here would be answering a question about a *plan* reader's authority, which
   * {@link BridgeService} explains is not this file's to answer.
   *
   * It does not touch Macroplan. Storing the returned id against an item is the caller's second,
   * **sequenced** write: `Lock` is not reentrant, so a create nested inside an item write would
   * deadlock rather than fail (`packages/store/src/queue-lock.ts`).
   *
   * What it does **not** swallow is the project's own task cap: `TaskService.create` calls
   * `assertWithin('tasksPerProject', …)` and throws, and that throw travels. A bound project at 500
   * tasks is a real conflict the caller must answer for, not an unlinked rail.
   */
  async createTask(binding: EpicBinding, name: string): Promise<string | null> {
    const token = open(this.#secret, binding.sealedToken)
    const live = token === null ? null : await this.#live(token, binding)
    if (live === null || live.role !== 'manage') return null
    return (await this.#tasks.create({ product: BOUND_PRODUCT, projectId: live.projectId }, name)).id
  }

  /** The bound project and its tasks, or the one unlinked answer. Takes no lock: it only reads. */
  async #bound(token: string, binding: EpicBinding): Promise<BoundProject> {
    const live = await this.#live(token, binding)
    if (live === null) return { state: 'unlinked' }
    const manifest = await this.#store.readManifest(BOUND_PRODUCT, live.projectId)
    if (manifest === null) return { state: 'unlinked' }
    return { state: 'bound', projectId: live.projectId, role: live.role, tasks: factsOf(manifest) }
  }

  /**
   * The project and attenuated role this token really holds, or `null` when it holds nothing here.
   *
   * The five refusals are one function so that both public methods are held to all of them: a reader
   * and a writer disagreeing about which bearers count would be the kind of gap that only shows up
   * as a live credential doing something nobody meant it to.
   */
  async #live(token: string, binding: EpicBinding): Promise<Live | null> {
    const principal = await this.#bearers.resolve(token)
    if (principal === null || principal.kind !== 'link') return null
    if (principal.scope.kind !== 'project') return null
    if (principal.scope.projectId !== binding.projectId) return null
    return { projectId: binding.projectId, role: effectiveBridgeRole(binding.role, principal.role) }
  }
}

/**
 * Every task of one project, keyed by id, carrying only the two facts the bridge reports.
 *
 * Read off the manifest's own entries rather than by opening each task file: `TaskEntry` already
 * caches `progress` beside the name (ADR 0007), so one manifest read answers every linked item under
 * an epic and a fan-out of one file read per link never happens. A projection rather than the entries
 * themselves, so a field added to `TaskEntry` — a folder, a tab list, a stamp — does not reach a
 * Macroplan reader by default.
 */
export function factsOf(manifest: ProjectManifest): ReadonlyMap<string, TaskFacts> {
  return new Map(manifest.tasks.map((task) => [task.id, { name: task.name, progress: task.progress }]))
}
