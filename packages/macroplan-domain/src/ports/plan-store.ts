import type { Product } from '@repo/kernel'
import type { ItemDocument } from '../entities/item.js'
import type { PlanManifest } from '../entities/plan.js'

/**
 * Persistence for plans, with the write ordering that keeps a crash recoverable.
 *
 * **Every value crosses this boundary as a copy, and the copy is deep.** A manifest handed back
 * may be mutated to any depth — a nested epic, a feature's `dependsOn` array — without the store
 * seeing it, and a manifest passed in is immune to the caller mutating it afterwards. The same
 * holds for an {@link ItemDocument}. That is what makes two adapters interchangeable rather than
 * merely similar: the filesystem adapter gets it from encoding to JSON and decoding back, and an
 * in-memory adapter has to reproduce it rather than hand out its own references. All four
 * directions are pinned by this port's contract suite.
 *
 * **Every method taking a plan id refuses one that is not a ULID**, a traversal-shaped id included,
 * and refuses it before touching any storage. {@link listManifests} is the only exception, because
 * it takes no plan id.
 *
 * **There is no `publishPlan`.** Microtask's `ProjectStore` has one because a bulk import builds a
 * project from nothing and so writes many task files and the manifest in one operation, which the
 * per-write ordering below cannot compose into. Macroplan has no import (spec §12), and no
 * operation here writes more than one item file and the manifest, so the two ordering rules of
 * ADR 0006 are the whole of the story and there is nothing for a staged directory and a rename to
 * make atomic.
 */
export interface PlanStore {
  /**
   * Reads every plan manifest, newest update first; ties on `updatedAt` break by **descending id**.
   *
   * A plan whose manifest {@link readManifest} answers `null` for is **left out**, which for an
   * undecodable manifest means the plan is absent from every listing rather than reported as
   * damaged. So is a container holding no manifest at all, and a container whose name could never
   * be a plan id: a listing skips it rather than raising over it.
   *
   * **The tiebreak is part of the contract rather than an implementation detail.** `updatedAt` is
   * an ISO instant, so two plans saved inside the same millisecond carry the same one, and sorting
   * on that field alone leaves their relative order to `Array.prototype.sort`'s stability — which
   * preserves the *input* order, and the input is a directory listing for one adapter and a map's
   * insertion order for another. Two adapters would then answer differently and the list endpoint
   * built on this would be flaky. `id` descending is the fallback because it is the same direction
   * as the primary key: a ULID opens with its creation millisecond, so the larger id is the plan
   * created later.
   */
  listManifests(product: Product): Promise<readonly PlanManifest[]>

  /**
   * Reads one plan manifest, or null when the plan is absent or its content cannot be decoded.
   *
   * The two branches are deliberately not distinguished — the same two {@link readItem} answers
   * `null` for, and for the same reason: one damaged file is not grounds for failing a read the
   * rest of the volume can serve. Neither branch is a schema check. An implementation promises only
   * that what it answers came back from its own encoding; a manifest that decodes to the wrong
   * *shape* is answered as it was stored.
   */
  readManifest(product: Product, planId: string): Promise<PlanManifest | null>

  /** Reads one item's description file, or null when it is absent or cannot be decoded. */
  readItem(product: Product, planId: string, itemId: string): Promise<ItemDocument | null>

  /** Writes the manifest alone, for every change that touches no item file. */
  saveManifest(product: Product, manifest: PlanManifest): Promise<void>

  /** Writes the item file, then the manifest, so a crash can only orphan a file (ADR 0006). */
  saveItem(product: Product, manifest: PlanManifest, item: ItemDocument): Promise<void>

  /**
   * Writes the manifest, then removes every named item file, in that order (ADR 0006).
   *
   * Takes a list rather than one id because deleting an epic deletes its features and every item
   * under them, and that must be **one** manifest write. A loop of single deletes republishes the
   * manifest per item, so an interrupted epic delete would leave the plan half-removed in the
   * manifest, which is the state ADR 0006 exists to prevent.
   *
   * An id the manifest does not name is removed if a file is there and passed over if none is:
   * a caller assembling the list from the manifest it is about to write has nothing to reconcile,
   * and a repeated delete is not an error.
   */
  deleteItems(product: Product, manifest: PlanManifest, itemIds: readonly string[]): Promise<void>

  /** Removes a plan and everything under it, reporting whether it existed. */
  deletePlan(product: Product, planId: string): Promise<boolean>
}
