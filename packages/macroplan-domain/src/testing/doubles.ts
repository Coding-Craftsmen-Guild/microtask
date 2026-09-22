import type { Clock, IdGenerator, Lock, Product } from '@repo/kernel'
import type { ItemDocument } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'
import { MemoryPlanStore } from './memory-plan-store.js'

/** A clock frozen at one instant, so a test can assert on a stamp it chose. */
export const fixedClock = (at: string): Clock => ({ now: () => at })

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Ids that are distinct, ULID-shaped, and reproducible from a seed. */
export function sequentialIds(seed = 1): IdGenerator {
  let counter = seed
  const next = (prefix: string): string => {
    counter += 1
    let out = ''
    for (const char of `${prefix}${String(counter).padStart(6, '0')}`) {
      out += B32[char.charCodeAt(0) % 32] ?? '0'
    }
    return out.padEnd(26, '0').slice(0, 26)
  }
  return {
    entityId: () => next('E'),
    token: () => {
      counter += 1
      return `tok_${String(counter).padStart(16, '0')}`
    },
  }
}

/**
 * Wraps a lock so a test can assert it was taken exactly once per mutation (ADR 0006).
 *
 * Every read-modify-write cycle in this package runs inside `lock.run`, and `Lock` is not
 * reentrant: a method that takes the lock and then calls a helper that takes it again deadlocks
 * against itself the moment the lock is a real queue. Counting the runs is what turns that from a
 * hang a suite notices as a timeout into an assertion that names the method.
 *
 * It wraps an inner lock rather than replacing one, so the serialisation under test is the real
 * `QueueLock` and this double only observes. The inner lock arrives as a parameter because a
 * `QueueLock` lives in `@repo/store`, which is this package's devDependency and must not become
 * an import of its shipped `./testing` entry point.
 */
export const countingLock = (inner: Lock): { lock: Lock; runs: () => number } => {
  let runs = 0
  const lock: Lock = {
    run: (work) => {
      runs += 1
      return inner.run(work)
    },
  }
  return { lock, runs: () => runs }
}

/** One write a {@link RecordingPlanStore} was asked to make, and the item ids it named. */
export interface StoreWrite {
  readonly method: 'saveManifest' | 'saveItem' | 'deleteItems'
  readonly itemIds: readonly string[]
}

/**
 * A {@link MemoryPlanStore} that also records, in order, every write it was asked to make.
 *
 * What a cascade has to be checked against is the *shape* of its writes and not only their
 * outcome: deleting an epic with forty items under it must reach the store as **one**
 * `deleteItems` call rather than forty, because the port's ordering rule only makes a delete
 * recoverable when the manifest goes out once (ADR 0006). Both facts are invisible in the
 * resulting state — a loop of single deletes ends up with the same plan on disk — so they are
 * asserted here, against the calls themselves.
 *
 * It extends the memory store rather than standing in for it, so what a test reads back afterwards
 * still came through the real adapter and its deep-copy boundary. That also means an inherited
 * method calling another one is recorded too: {@link saveItem} writes the item file and then calls
 * `saveManifest`, so one call to it records both, in that order, which is the ordering ADR 0006
 * asks for.
 */
export class RecordingPlanStore extends MemoryPlanStore {
  readonly writes: StoreWrite[] = []

  /** Every write so far, as method names alone, in the order they were made. */
  methods(): readonly string[] {
    return this.writes.map((write) => write.method)
  }

  /** Every `deleteItems` call so far, so a test can count them and read the ids they carried. */
  deletes(): readonly StoreWrite[] {
    return this.writes.filter((write) => write.method === 'deleteItems')
  }

  /** Records the manifest write, then makes it. */
  override async saveManifest(product: Product, manifest: PlanManifest): Promise<void> {
    this.writes.push({ method: 'saveManifest', itemIds: [] })
    await super.saveManifest(product, manifest)
  }

  /** Records the item write, then makes it — the item file first, then the manifest. */
  override async saveItem(
    product: Product,
    manifest: PlanManifest,
    item: ItemDocument,
  ): Promise<void> {
    this.writes.push({ method: 'saveItem', itemIds: [item.id] })
    await super.saveItem(product, manifest, item)
  }

  /** Records the ids this one call names, then makes the write. */
  override async deleteItems(
    product: Product,
    manifest: PlanManifest,
    itemIds: readonly string[],
  ): Promise<void> {
    this.writes.push({ method: 'deleteItems', itemIds: [...itemIds] })
    await super.deleteItems(product, manifest, itemIds)
  }
}
