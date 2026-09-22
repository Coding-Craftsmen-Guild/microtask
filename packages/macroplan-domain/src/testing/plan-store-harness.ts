import type { Product } from '@repo/kernel'
import type { PlanStore } from '../ports/plan-store.js'

/**
 * The adapter under test, plus whatever setup that adapter can offer the contract.
 *
 * The three hooks are optional because an adapter with no way around its own encoding cannot plant
 * bytes it would refuse to write, and skipping a case is preferable to widening `PlanStore` with a
 * write method the application would never call.
 */
export interface PlanStoreHarness {
  /** The adapter every case runs against. */
  store: PlanStore

  /** Discards all stored data, so each case starts from nothing. */
  reset(): Promise<void>

  /**
   * Stores content of the harness's choosing under a plan's manifest key, bypassing whatever
   * encoding the adapter uses, so the contract can pin what a manifest the store cannot decode
   * does to a read and to a listing.
   */
  writeUndecodableManifest?(product: Product, planId: string, raw: string): Promise<void>

  /**
   * Stores content of the harness's choosing under an item's key, bypassing whatever encoding the
   * adapter uses, so the contract can prove a corrupt item reads back as null rather than throwing.
   */
  writeUndecodableItem?(
    product: Product,
    planId: string,
    itemId: string,
    raw: string,
  ): Promise<void>

  /**
   * Creates a plan container named `name` holding no manifest, so the contract can prove that
   * `listManifests` leaves it out rather than failing.
   */
  addContainerWithoutManifest?(product: Product, name: string): Promise<void>
}
