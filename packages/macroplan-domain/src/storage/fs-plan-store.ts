import { isUlid, type FileSystem, type Product } from '@repo/kernel'
import type { ItemDocument } from '../entities/item.js'
import { newestUpdateFirst } from '../entities/plan-order.js'
import type { PlanManifest } from '../entities/plan.js'
import type { PlanStore } from '../ports/plan-store.js'
import { itemFile, manifestFile, planDir, plansDir } from './paths.js'

/** How an FsPlanStore reaches the disk and where it puts its data. */
export interface FsPlanStoreOptions {
  readonly files: FileSystem
  readonly root: () => string
}

/**
 * A PlanStore over plain JSON files, one directory per plan.
 *
 * Every id is checked by the path builders in `paths.ts` before a path exists to reach, so the
 * port's "refuses a plan id that is not a ULID" is a property of building the path rather than a
 * guard this class repeats. {@link FsPlanStore.listManifests} is the one method that builds no plan
 * path and therefore checks no plan id — it has none to check.
 *
 * Both copy directions the port promises come free here: a read parses the bytes on disk into a
 * fresh value, and a write serialises before anything is stored.
 */
export class FsPlanStore implements PlanStore {
  readonly #files: FileSystem
  readonly #root: () => string

  /** Creates a store that reads its data root afresh on every call. */
  constructor(options: FsPlanStoreOptions) {
    this.#files = options.files
    this.#root = options.root
  }

  /**
   * Reads every plan manifest, newest update first, ties broken by descending id.
   *
   * A child of the plans directory whose name is not a ULID is skipped before a manifest is even
   * looked for, and one whose manifest is absent or will not parse is left out by
   * {@link FsPlanStore.readManifest} answering null.
   */
  async listManifests(product: Product): Promise<readonly PlanManifest[]> {
    const ids = await this.#files.listDirs(plansDir(this.#root(), product))
    const found: PlanManifest[] = []
    for (const id of ids) {
      if (!isUlid(id)) continue
      const manifest = await this.readManifest(product, id)
      if (manifest) found.push(manifest)
    }
    return found.sort(newestUpdateFirst)
  }

  /** Reads one plan manifest, or null when its file is missing or will not parse. */
  async readManifest(product: Product, planId: string): Promise<PlanManifest | null> {
    return this.#readJson<PlanManifest>(manifestFile(this.#root(), product, planId))
  }

  /** Reads one item's description, or null when its file is missing or will not parse. */
  async readItem(product: Product, planId: string, itemId: string): Promise<ItemDocument | null> {
    return this.#readJson<ItemDocument>(itemFile(this.#root(), product, planId, itemId))
  }

  /** Writes the manifest alone, for every change that touches no item file. */
  async saveManifest(product: Product, manifest: PlanManifest): Promise<void> {
    await this.#writeJson(manifestFile(this.#root(), product, manifest.id), manifest)
  }

  /** Writes the item file, then the manifest, so a crash can only orphan a file (ADR 0006). */
  async saveItem(product: Product, manifest: PlanManifest, item: ItemDocument): Promise<void> {
    await this.#writeJson(itemFile(this.#root(), product, manifest.id, item.id), item)
    await this.saveManifest(product, manifest)
  }

  /**
   * Writes the manifest, then unlinks every named item file, in that order (ADR 0006).
   *
   * One manifest write for the whole list is the reason this takes a list at all, and it is why the
   * unlinks come after: an interrupted sweep leaves files nothing references, which is harmless
   * garbage, where the other order would leave the manifest naming files that are gone.
   *
   * **Every path is built before the manifest is written**, which is how this method validates ahead
   * of storage like every other one: `itemFile` is where a non-ULID item id is refused, so building
   * the paths inside the unlink loop published the manifest and *then* threw `Invalid`, leaving a
   * half-applied delete. Both adapters did it, so nothing contradicted the contract either — which
   * is why the contract now has a case for it.
   */
  async deleteItems(
    product: Product,
    manifest: PlanManifest,
    itemIds: readonly string[],
  ): Promise<void> {
    const files = itemIds.map((itemId) => itemFile(this.#root(), product, manifest.id, itemId))
    await this.saveManifest(product, manifest)
    for (const file of files) await this.#files.remove(file)
  }

  /** Removes a plan and everything under it, reporting whether it existed. */
  async deletePlan(product: Product, planId: string): Promise<boolean> {
    return this.#files.removeDir(planDir(this.#root(), product, planId))
  }

  async #readJson<T>(file: string): Promise<T | null> {
    const raw = await this.#files.readText(file)
    if (raw === null) return null
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  async #writeJson(file: string, value: unknown): Promise<void> {
    await this.#files.writeTextAtomic(file, JSON.stringify(value, null, 2))
  }
}
