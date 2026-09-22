import path from 'node:path'
import { contained, Invalid, isProduct, isUlid, type Product } from '@repo/kernel'

const MANIFEST = 'plan.json'
const PLANS = 'plans'
const ITEMS = 'items'
const PLAN_ID = 'Plan id must be a ULID'
const ITEM_ID = 'Item id must be a ULID'

const productRoot = (root: string, product: Product): string => {
  if (!isProduct(product)) throw new Invalid('Unknown product')
  return contained(root, path.join(root, product))
}

const inside = (parent: string, segment: string): string =>
  contained(parent, path.join(parent, segment))

/**
 * Resolves the directory holding every plan for one product.
 *
 * A **sibling** of `projects/` under the product root, never a child: `FsProjectStore` and
 * `FsPlanStore` each list the immediate ULID-named children of their own root and read a manifest
 * out of each, so one nested inside the other would make a plan look like a project (or the
 * reverse) to whichever store lists the wrong directory. `warmTokenIndex` loads the share tokens of
 * both on the way to serving a socket, which is what a shared root would corrupt.
 */
export function plansDir(root: string, product: Product): string {
  return inside(productRoot(root, product), PLANS)
}

/**
 * Resolves the directory holding one plan's files.
 *
 * `isUlid` is what actually rejects `'..'`, `'a/b'` and an absolute path here — none of those are
 * 26 characters from the ULID alphabet, so the check below throws before `path.join` ever sees
 * the value. `contained()` is verified directly (its own test suite) and kept as the backstop for
 * every builder in this file, but no public builder here can reach its throw.
 */
export function planDir(root: string, product: Product, planId: string): string {
  if (!isUlid(planId)) throw new Invalid(PLAN_ID)
  return inside(plansDir(root, product), planId)
}

/** Resolves the file holding one plan's manifest. */
export function manifestFile(root: string, product: Product, planId: string): string {
  return inside(planDir(root, product, planId), MANIFEST)
}

/** Resolves the directory holding one plan's item files. */
export function itemsDir(root: string, product: Product, planId: string): string {
  return inside(planDir(root, product, planId), ITEMS)
}

/** Resolves the file holding one item's document. */
export function itemFile(
  root: string,
  product: Product,
  planId: string,
  itemId: string,
): string {
  if (!isUlid(itemId)) throw new Invalid(ITEM_ID)
  return inside(itemsDir(root, product, planId), `${itemId}.json`)
}
