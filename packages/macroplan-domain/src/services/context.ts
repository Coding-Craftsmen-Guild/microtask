import type { Clock, IdGenerator, Lock, TokenIndex } from '@repo/kernel'
import type { PlanStore } from '../ports/plan-store.js'

/**
 * Everything a plan service needs, supplied by whoever constructs it (ADR 0030).
 *
 * Named `PlanContext` rather than `ServiceContext`: `apps/api` imports both this package and
 * `@repo/microtask-domain`, and two exported interfaces both called `ServiceContext`, differing
 * only in which store they carry, is a `deps.ts` that compiles for the wrong reason. Every member
 * is a port, so one construction shape serves every service in this package and a service never
 * names a concrete collaborator. `lock` is a correctness requirement rather than a convenience:
 * atomic replace is not concurrent-safe on Windows, so every read-modify-write cycle runs inside
 * `lock.run` (ADR 0006). `Lock` is not reentrant, so a method that already holds the lock must
 * call only helpers that do not take it.
 */
export interface PlanContext {
  readonly store: PlanStore
  readonly lock: Lock
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly tokens: TokenIndex
}
