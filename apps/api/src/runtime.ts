import { PRODUCTS, shareToken, ulid, type Clock, type IdGenerator } from '@repo/kernel'
import { FsProjectStore, ShareIndex } from '@repo/microtask-domain'
import { NodeFileSystem, QueueLock } from '@repo/store'
import type { ApiConfig } from './config.js'
import type { ApiDeps } from './deps.js'

const systemClock: Clock = { now: () => new Date().toISOString() }

const randomIds: IdGenerator = { entityId: ulid, token: shareToken }

/**
 * The production wiring: the one place a concrete adapter is chosen for each port.
 *
 * Separate from `server.ts` so it is reachable from a test, which `server.ts` is not — that file
 * calls `serve()` at module scope, so importing it would open a socket and hold the event loop.
 * Everything here is pure construction: nothing reads the environment, nothing touches the disk
 * until a port is called, and the config arrives already validated.
 *
 * `root` is a thunk rather than a string because `FsProjectStore` re-reads its data root on every
 * call, which is what lets a test move the root under a live store.
 */
export function buildRuntimeDeps(config: ApiConfig): ApiDeps {
  const fileSystem = new NodeFileSystem()
  return {
    config,
    fileSystem,
    store: new FsProjectStore({ files: fileSystem, root: () => config.dataDir }),
    lock: new QueueLock(),
    clock: systemClock,
    ids: randomIds,
    tokens: new ShareIndex(),
  }
}

/**
 * Fills the in-process token index from the manifests already on disk.
 *
 * Without it, **every share link minted before this process started answers 401.** `ShareIndex`
 * keeps a `Map` in this process and `ShareLinkService.create` is the only thing that ever writes
 * to it, so a cold start against an existing data root resolves no token at all: the credential
 * is valid, the manifest holds it, and `PrincipalResolver` refuses it anyway because the index it
 * asks first has never seen it. The failure is total, silent, and looks to a client exactly like
 * a revoked link.
 *
 * It runs before `serve()` rather than lazily, so the process is either ready or not listening.
 * A project added to the volume by something other than this API — ADR 0017 admits imported
 * bundles — is not indexed until a restart. That is a bound of a per-process index, and the same
 * bound that makes a second replica unsafe (ADR 0006, carried forward to Plan 3).
 */
export async function warmTokenIndex(deps: ApiDeps): Promise<number> {
  let counted = 0
  for (const product of PRODUCTS) {
    for (const manifest of await deps.store.listManifests(product)) {
      deps.tokens.add(product, manifest)
      counted += manifest.shareLinks.length
    }
  }
  return counted
}
