import { Invalid, isProduct, isUlid, type Product } from '@repo/kernel'
import type { ItemDocument } from '../entities/item.js'
import { newestUpdateFirst } from '../entities/plan-order.js'
import type { PlanManifest } from '../entities/plan.js'
import type { PlanStore } from '../ports/plan-store.js'

const containerKey = (product: Product, name: string): string => `${product}/${name}`

const itemKey = (product: Product, planId: string, itemId: string): string =>
  `${containerKey(product, planId)}/${itemId}`

function assertProduct(product: Product): void {
  if (!isProduct(product)) throw new Invalid('Unknown product')
}

function assertIds(product: Product, planId: string, itemId?: string): void {
  assertProduct(product)
  if (!isUlid(planId)) throw new Invalid('Plan id must be a ULID')
  if (itemId !== undefined && !isUlid(itemId)) throw new Invalid('Item id must be a ULID')
}

function parseOrNull<T>(raw: string | undefined): T | null {
  if (raw === undefined) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

/**
 * A PlanStore keeping serialised JSON in memory, so a service test never touches a disk.
 *
 * Values are stored as strings rather than objects on purpose: every read parses afresh and every
 * write serialises, so this store is the same value boundary the filesystem adapter is. A caller
 * that mutates a manifest it was handed — a nested epic included — cannot reach back into the
 * store, which is what keeps the two adapters interchangeable rather than merely similar.
 *
 * The ULID guards repeat what `storage/paths.ts` gets for free from building a path, because this
 * adapter builds no paths and the port promises the guard rather than the filesystem.
 */
export class MemoryPlanStore implements PlanStore {
  readonly #containers = new Set<string>()
  readonly #manifests = new Map<string, string>()
  readonly #items = new Map<string, string>()

  /** Discards every plan, so each case in a suite starts from nothing. */
  clear(): void {
    this.#containers.clear()
    this.#manifests.clear()
    this.#items.clear()
  }

  /** Plants bytes where a manifest's JSON belongs, bypassing this store's own serialisation. */
  putRawManifest(product: Product, planId: string, raw: string): void {
    this.#containers.add(containerKey(product, planId))
    this.#manifests.set(containerKey(product, planId), raw)
  }

  /** Plants bytes where an item's JSON belongs, bypassing this store's own serialisation. */
  putRawItem(product: Product, planId: string, itemId: string, raw: string): void {
    this.#containers.add(containerKey(product, planId))
    this.#items.set(itemKey(product, planId, itemId), raw)
  }

  /** Adds a container under any name, modelling a plan container holding no manifest. */
  addContainer(product: Product, name: string): void {
    this.#containers.add(containerKey(product, name))
  }

  /** Reads every plan manifest, newest update first, ties broken by descending id. */
  async listManifests(product: Product): Promise<readonly PlanManifest[]> {
    assertProduct(product)
    const found: PlanManifest[] = []
    for (const id of this.#names(product)) {
      if (!isUlid(id)) continue
      const manifest = await this.readManifest(product, id)
      if (manifest) found.push(manifest)
    }
    return found.sort(newestUpdateFirst)
  }

  /** Reads one plan manifest, or null when the plan is absent or its content will not parse. */
  async readManifest(product: Product, planId: string): Promise<PlanManifest | null> {
    assertIds(product, planId)
    return parseOrNull<PlanManifest>(this.#manifests.get(containerKey(product, planId)))
  }

  /** Reads one item's description, or null when it is absent or its content will not parse. */
  async readItem(product: Product, planId: string, itemId: string): Promise<ItemDocument | null> {
    assertIds(product, planId, itemId)
    return parseOrNull<ItemDocument>(this.#items.get(itemKey(product, planId, itemId)))
  }

  /** Writes the manifest alone, for every change that touches no item file. */
  async saveManifest(product: Product, manifest: PlanManifest): Promise<void> {
    assertIds(product, manifest.id)
    this.#containers.add(containerKey(product, manifest.id))
    this.#manifests.set(containerKey(product, manifest.id), JSON.stringify(manifest))
  }

  /** Writes the item, then the manifest, matching the order the port documents. */
  async saveItem(product: Product, manifest: PlanManifest, item: ItemDocument): Promise<void> {
    assertIds(product, manifest.id, item.id)
    this.#items.set(itemKey(product, manifest.id, item.id), JSON.stringify(item))
    await this.saveManifest(product, manifest)
  }

  /**
   * Writes the manifest, then drops every named item, matching the order the port documents.
   *
   * Every id is checked before the manifest write, not inside the drop loop: validating as it went
   * published the manifest and then threw `Invalid` on the first bad item id, leaving a half-applied
   * delete that the filesystem adapter matched exactly.
   */
  async deleteItems(
    product: Product,
    manifest: PlanManifest,
    itemIds: readonly string[],
  ): Promise<void> {
    assertIds(product, manifest.id)
    for (const itemId of itemIds) assertIds(product, manifest.id, itemId)
    await this.saveManifest(product, manifest)
    for (const itemId of itemIds) this.#items.delete(itemKey(product, manifest.id, itemId))
  }

  /** Removes a plan and everything under it, reporting whether it existed. */
  async deletePlan(product: Product, planId: string): Promise<boolean> {
    assertIds(product, planId)
    const at = containerKey(product, planId)
    const existed = this.#containers.delete(at)
    this.#manifests.delete(at)
    for (const key of [...this.#items.keys()]) {
      if (key.startsWith(`${at}/`)) this.#items.delete(key)
    }
    return existed
  }

  *#names(product: Product): Generator<string> {
    const prefix = `${product}/`
    for (const at of this.#containers) {
      if (at.startsWith(prefix)) yield at.slice(prefix.length)
    }
  }
}
