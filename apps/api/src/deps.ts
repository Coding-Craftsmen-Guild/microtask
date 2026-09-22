import type { FileSystem } from '@repo/kernel'
import type { PlanStore } from '@repo/macroplan-domain'
import type { ServiceContext } from '@repo/microtask-domain'
import type { ApiConfig } from './config.js'

/**
 * The whole constructor-injection surface `createApp` is built from: the validated `config`, the
 * `fileSystem` that `FsProjectStore` needs at construction, and — inherited rather than
 * restated — `store`, `lock`, `clock`, `ids` and `tokens`.
 *
 * It extends `ServiceContext` instead of repeating those five members so that "an `ApiDeps`
 * destructures straight into a `ServiceContext`" is a compiler guarantee rather than a
 * convention: a port renamed or added in `packages/microtask-domain` then fails here, at the one
 * seam, instead of at every `buildServices` call site. Every member but `config` is a port, so
 * the app names no concrete collaborator and a test substitutes one by passing a different
 * object (ADR 0030).
 */
export interface ApiDeps extends ServiceContext {
  readonly config: ApiConfig
  readonly fileSystem: FileSystem

  /**
   * The Macroplan half of persistence, beside the Microtask `store` it inherits.
   *
   * It is here rather than only inside a Macroplan subtree because two things that are not a
   * Macroplan route need it: `warmTokenIndex`, which has to load a plan's share tokens or every one
   * of them answers 401 after a restart, and `PrincipalResolver`, which reads a bearer's live link
   * from whichever product's manifest holds it. One token index serving both products is what makes
   * both of those product-agnostic, so the stores they read through have to arrive together.
   */
  readonly plans: PlanStore
}
