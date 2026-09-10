import type { Clock, IdGenerator, Lock } from '@repo/kernel'
import type { ProjectStore } from '../ports/project-store.js'
import type { TokenIndex } from '../ports/token-index.js'

/**
 * Everything a service needs, supplied by whoever constructs it.
 *
 * Every member is a port, so one construction shape serves every service and a service never
 * names a concrete collaborator (ADR 0030). Not every service uses every member; the uniformity
 * is what is being bought. No service reads `process.env`, constructs a store, or reads the clock
 * itself (ADR 0027), and `lock` is a correctness requirement rather than a convenience: atomic
 * replace is not concurrent-safe on Windows, so every read-modify-write cycle runs inside
 * `lock.run` (ADR 0006). `Lock` is not reentrant, so a method that already holds the lock must
 * call only helpers that do not take it.
 */
export interface ServiceContext {
  readonly store: ProjectStore
  readonly lock: Lock
  readonly clock: Clock
  readonly ids: IdGenerator
  readonly tokens: TokenIndex
}
