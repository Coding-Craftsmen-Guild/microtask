import {
  PRODUCTS,
  ShareIndex,
  shareToken,
  ulid,
  type Clock,
  type IdGenerator,
  type Product,
  type TokenIndex,
} from '@repo/kernel'
import { FsPlanStore } from '@repo/macroplan-domain'
import { FsProjectStore } from '@repo/microtask-domain'
import { NodeFileSystem, QueueLock } from '@repo/store'
import type { ApiConfig } from './config.js'
import type { ApiDeps } from './deps.js'

const systemClock: Clock = { now: () => new Date().toISOString() }

const randomIds: IdGenerator = { entityId: ulid, token: shareToken }

interface Shared {
  readonly id: string
  readonly shareLinks: readonly { readonly token: string }[]
}

const warm = (tokens: TokenIndex, product: Product, containers: readonly Shared[]): number => {
  let counted = 0
  for (const container of containers) {
    const held = container.shareLinks.map((link) => link.token)
    tokens.add({ product, containerId: container.id }, held)
    counted += held.length
  }
  return counted
}

/**
 * The production wiring: the one place a concrete adapter is chosen for each port.
 *
 * Separate from `server.ts` so it is reachable from a test, which `server.ts` is not — that file
 * calls `serve()` at module scope, so importing it would open a socket and hold the event loop.
 * Everything here is pure construction: nothing reads the environment, nothing touches the disk
 * until a port is called, and the config arrives already validated.
 *
 * `root` is a thunk rather than a string because both stores re-read their data root on every
 * call, which is what lets a test move the root under a live store.
 */
export function buildRuntimeDeps(config: ApiConfig): ApiDeps {
  const fileSystem = new NodeFileSystem()
  const root = (): string => config.dataDir
  return {
    config,
    fileSystem,
    store: new FsProjectStore({ files: fileSystem, root }),
    plans: new FsPlanStore({ files: fileSystem, root }),
    lock: new QueueLock(),
    clock: systemClock,
    ids: randomIds,
    tokens: new ShareIndex(),
  }
}

/**
 * Fills the in-process token index from the manifests already on disk, in **both** products.
 *
 * Without it, **every share link minted before this process started answers 401.** `ShareIndex`
 * keeps a `Map` in this process and a service's own write is the only other thing that ever
 * records to it, so a cold start against an existing data root resolves no token at all: the
 * credential is valid, the manifest holds it, and `PrincipalResolver` refuses it anyway because the
 * index it asks first has never seen it. The failure is total, silent, and looks to a client
 * exactly like a revoked link. One index now serves both products, so that failure was possible in
 * two of them and both stores are walked here.
 *
 * `projects/` and `plans/` are **siblings** under each product root, so neither listing can see the
 * other's directories and warming both cannot manufacture a collision: one token in two containers
 * still throws `Conflict`, but only because a manifest genuinely holds a token another manifest
 * holds — which is the state that must stop the boot rather than be tolerated.
 *
 * **Each product is read through the one store it uses**, rather than every store for every product.
 * `TokenOwner` names a container by its product and its id, which is unambiguous only while one
 * product tag means one kind of container. Listing plans under `microtask/` as well would break
 * that: a plan directory there sharing a project's ULID keys to the same owner, and `add` replaces
 * an owner's tokens — so the project's live links would be dropped from the index silently, with no
 * `Conflict` to stop the boot and every one of them answering 401. Measured, before this mapping
 * was made explicit. The `Record` keyed by `Product` is what keeps a third product from being
 * forgotten here, exactly as it does in `linkDirectories`.
 *
 * It runs before `serve()` rather than lazily, so the process is either ready or not listening.
 * A container added to the volume by something other than this API — ADR 0017 admits imported
 * bundles — is not indexed until a restart. That is a bound of a per-process index, and the same
 * bound that makes a second replica unsafe (ADR 0006, carried forward to Plan 3).
 */
export async function warmTokenIndex(deps: ApiDeps): Promise<number> {
  const listing: Readonly<Record<Product, () => Promise<readonly Shared[]>>> = {
    microtask: () => deps.store.listManifests('microtask'),
    macroplan: () => deps.plans.listManifests('macroplan'),
  }
  let counted = 0
  for (const product of PRODUCTS) {
    counted += warm(deps.tokens, product, await listing[product]())
  }
  return counted
}
