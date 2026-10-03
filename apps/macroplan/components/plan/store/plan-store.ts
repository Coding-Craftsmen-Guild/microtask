import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import type { PlanScreenModel } from '../plan-screen-model'
import { withSchedule } from './with-schedule'

type Answer = ActionResult<PlanScreenModel>

/** Says which id the API minted for a placeholder an op created under: `name('pending:3', '01J…')`. */
export type Name = (placeholder: string, real: string) => void

/** One change to the plan: what it does, said now, and how it is persisted, answered later. */
export interface PlanOp {
  /** The change itself, applied to the plan the moment the op is run — pure, and safe to run again. */
  readonly apply: (plan: PlanScreenModel) => PlanScreenModel

  /**
   * The persistence: one Server Action, or a chain of them for a gesture that makes several writes.
   *
   * A chain hands `confirm` each plan it is answered with along the way, so that a refusal part-way still
   * leaves on screen what the server did store — the feature a draw created before its edge was refused.
   * An op that creates something hands `name` the id its placeholder was answered with, the moment it is.
   */
  readonly send: (confirm: (plan: PlanScreenModel) => void, name: Name) => Promise<Answer>
}

/** What the plan screen renders from: the plan as it will be, and whether that is settled yet. */
export interface PlanSnapshot {
  /** The last answered plan with every pending change on top, its schedule recomputed. */
  readonly plan: PlanScreenModel

  /** Whether any change has not been answered yet. */
  readonly saving: boolean

  /** What the last refused change was refused with, until it is dismissed or another one is. */
  readonly failure: string | null
}

/** The plan screen's one source of truth, shaped for `useSyncExternalStore`. */
export interface PlanStore {
  readonly getSnapshot: () => PlanSnapshot
  readonly subscribe: (listener: () => void) => () => void

  /** Apply a change now and persist it after every change made before it; resolves with the answer. */
  readonly run: (op: PlanOp) => Promise<Answer>

  /** Take a plan the server pushed (a re-render) as the confirmed one, unless it is older than that. */
  readonly adopt: (plan: PlanScreenModel) => void

  /** Forget the refusal on screen. */
  readonly dismiss: () => void

  /** The id a placeholder was answered with, once its create has been; any other id, as it is. */
  readonly real: (id: string) => string

  /** The placeholder an id was first drawn under on this page; any other id, as it is. */
  readonly first: (id: string) => string
}

interface Entry {
  readonly op: PlanOp
  readonly resolve: (answer: Answer) => void
  readonly reject: (error: unknown) => void
  partial: PlanScreenModel | null
}

/**
 * The store an optimistic plan screen runs on (ADR 0069).
 *
 * ### Two layers
 *
 * `confirmed` is the last plan the API answered, schedule and all. On top of it sits the queue: every
 * change made and not yet answered, as a pure function. The screen renders the queue applied to
 * `confirmed`, with the schedule recomputed by the same function the API runs — so a drop moves every bar
 * it moves in the frame it is made, and the answer, when it lands, changes nothing that was right.
 *
 * ### One write at a time, in order
 *
 * A change's `send` starts only once every earlier one has settled. Next does not promise that on its own:
 * it queues Server Actions, but a navigation — and every drawer move is one, through `history.pushState` —
 * lets the next queued action start while the one before it is still out. A gesture can also be a *chain*
 * of them (a draw creates, then places, then labels), and two chains must not interleave on the server.
 * Sending in order makes every answer the newest state of this queue's writes, so each one becomes
 * `confirmed` and the changes still queued re-apply on it — unless a plan adopted meanwhile is newer
 * still, which a write outside the queue (renaming the plan) can make between two steps of a chain. The
 * confirmed plan only ever moves forward in time, whichever of the two arrives last.
 *
 * ### Placeholders, and the ids they become
 *
 * Something created is on screen before the API has minted its id, under a placeholder
 * (`./optimistic-actions.ts`), and whatever the reader does to it meanwhile — renames it in its drawer,
 * draws from its end, points an edge at it — is queued under that placeholder, which the API has never
 * heard of. So the op that creates it names it the moment its create is answered, and from then on
 * {@link PlanStore.real} reads the placeholder as the real id: every queued edit re-applies under it, every
 * queued write is sent with it (each resolves its ids when it is sent, not when it was made), and a drawer
 * open on the placeholder's address moves to the real one (`../app/plan-drawer.tsx`). {@link PlanStore.first}
 * reads it back the other way, which is what that drawer is keyed by, so the panel the reader is typing in
 * is not remounted under them.
 *
 * ### Refusals
 *
 * A refused change is dropped from the queue, which takes it back off the screen; the rest stay. Its
 * promise still resolves with the refusal, so a field can say why in its own words, and the sentence is
 * also kept here for whatever the screen shows when the thing that asked has gone. A `send` that throws is
 * a write that got no answer: it is dropped the same way and the error is passed on, so a framework
 * redirect thrown through it still reaches the caller's `orNoAnswer` and from there the router.
 *
 * @param initial - The plan the page was rendered with.
 * @returns The store.
 */
export function createPlanStore(initial: PlanScreenModel): PlanStore {
  return new OptimisticPlan(initial)
}

const newest = (one: PlanScreenModel, other: PlanScreenModel): PlanScreenModel =>
  one.updatedAt < other.updatedAt ? other : one

class OptimisticPlan implements PlanStore {
  #confirmed: PlanScreenModel
  #failure: string | null = null
  #snapshot: PlanSnapshot
  #sending = false
  readonly #queue: Entry[] = []
  readonly #listeners = new Set<() => void>()
  readonly #reals = new Map<string, string>()
  readonly #firsts = new Map<string, string>()

  constructor(initial: PlanScreenModel) {
    this.#confirmed = initial
    this.#snapshot = { plan: initial, saving: false, failure: null }
  }

  readonly getSnapshot = (): PlanSnapshot => this.#snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  readonly run = (op: PlanOp): Promise<Answer> =>
    new Promise<Answer>((resolve, reject) => {
      this.#queue.push({ op, resolve, reject, partial: null })
      this.#publish()
      void this.#pump()
    })

  readonly adopt = (plan: PlanScreenModel): void => {
    if (plan === this.#confirmed || newest(plan, this.#confirmed) !== plan) return
    this.#confirmed = plan
    this.#publish()
  }

  readonly real = (id: string): string => this.#reals.get(id) ?? id

  readonly first = (id: string): string => this.#firsts.get(id) ?? id

  #name(placeholder: string, real: string): void {
    if (this.#reals.get(placeholder) === real) return
    this.#reals.set(placeholder, real)
    this.#firsts.set(real, placeholder)
    this.#publish()
  }

  readonly dismiss = (): void => {
    if (this.#failure === null) return
    this.#failure = null
    this.#snapshot = { ...this.#snapshot, failure: null }
    this.#tell()
  }

  #tell(): void {
    for (const listener of this.#listeners) listener()
  }

  #publish(): void {
    const queued = this.#queue
    const applied = queued.reduce((was, entry) => entry.op.apply(was), this.#confirmed)
    const plan = applied === this.#confirmed ? applied : withSchedule(applied)
    this.#snapshot = { plan, saving: queued.length > 0, failure: this.#failure }
    this.#tell()
  }

  #settle(entry: Entry, answer: Answer): void {
    if (answer.ok) this.#confirmed = newest(answer.value, this.#confirmed)
    else this.#refused(entry, answer.detail)
    this.#queue.shift()
    this.#publish()
    entry.resolve(answer)
  }

  #refused(entry: Entry, detail: string): void {
    if (entry.partial !== null) this.#confirmed = newest(entry.partial, this.#confirmed)
    this.#failure = detail
  }

  #unanswered(entry: Entry, error: unknown): void {
    this.#refused(entry, NO_ANSWER.detail)
    this.#queue.shift()
    this.#publish()
    entry.reject(error)
  }

  async #pump(): Promise<void> {
    if (this.#sending) return
    this.#sending = true
    for (let head = this.#queue[0]; head !== undefined; head = this.#queue[0]) {
      const entry = head
      await Promise.resolve()
        .then(() =>
          entry.op.send(
            (plan) => (entry.partial = plan),
            (placeholder, real) => this.#name(placeholder, real),
          ),
        )
        .then(
          (answer) => this.#settle(entry, answer),
          (error: unknown) => this.#unanswered(entry, error),
        )
    }
    this.#sending = false
  }
}
