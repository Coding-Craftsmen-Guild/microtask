import type { Product } from '@repo/kernel'

/**
 * The product every route under this subtree addresses.
 *
 * Named once rather than spelled into each service call, because a `ProjectRef` carries it and a
 * typo would reach a store that answers "no such project" rather than "no such product" — a 404
 * that looks like missing data instead of a wiring mistake.
 */
export const PRODUCT: Product = 'microtask'
