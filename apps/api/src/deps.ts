import type { FileSystem } from '@repo/kernel'
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
}
