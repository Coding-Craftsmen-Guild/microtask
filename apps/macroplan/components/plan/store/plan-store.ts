import { NO_ANSWER } from '@repo/app-session/no-answer'
import type { ActionResult } from '../../../actions/result'
import type { PlanScreenModel } from '../plan-screen-model'
import { withSchedule } from './with-schedule'

type Answer = ActionResult<PlanScreenModel>

/** One change to the plan: what it does, said now, and how it is persisted, answered later. */
export interface PlanOp {
  /** The change itself, applied to the plan the moment the op is run — pure, and safe to run again. */
  readonly apply: (plan: PlanScreenModel) => PlanScreenModel

  /** The persistence: one Server Action, or a chain of them for a gesture that makes several writes. */
  readonly send: () => Promise<Answer>
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
}

interface Entry {
  readonly op: PlanOp
  readonly resolve: (answer: Answer) => void
  readonly reject: (error: unknown) => void
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
 * A change's `send` starts only once every earlier one has settled. Next already dispatches Server Actions
 * one at a time per client, but a gesture can be a *chain* of them (a draw creates, then places, then
 * labels), and two chains must not interleave on the server. Sending in order also makes every answer the
 * newest server state, so each one simply becomes `confirmed` and the changes still queued re-apply on it.
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

class OptimisticPlan implements PlanStore {
  #confirmed: PlanScreenModel
  #failure: string | null = null
  #snapshot: PlanSnapshot
  #sending = false
  readonly #queue: Entry[] = []
  readonly #listeners = new Set<() => void>()

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
      this.#queue.push({ op, resolve, reject })
      this.#publish()
      void this.#pump()
    })

  readonly adopt = (plan: PlanScreenModel): void => {
    if (plan === this.#confirmed || plan.updatedAt < this.#confirmed.updatedAt) return
    this.#confirmed = plan
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
    const plan =
      queued.length === 0 ? this.#confirmed : withSchedule(queued.reduce((was, entry) => entry.op.apply(was), this.#confirmed))
    this.#snapshot = { plan, saving: queued.length > 0, failure: this.#failure }
    this.#tell()
  }

  #settle(entry: Entry, answer: Answer): void {
    if (answer.ok) this.#confirmed = answer.value
    else this.#failure = answer.detail
    this.#queue.shift()
    this.#publish()
    entry.resolve(answer)
  }

  #unanswered(entry: Entry, error: unknown): void {
    this.#failure = NO_ANSWER.detail
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
        .then(() => entry.op.send())
        .then(
          (answer) => this.#settle(entry, answer),
          (error: unknown) => this.#unanswered(entry, error),
        )
    }
    this.#sending = false
  }
}
