import type { Product } from '@repo/kernel'

/**
 * The product every route under this subtree addresses.
 *
 * Named once rather than spelled into each service call, because a `PlanRef` carries it and a typo
 * would reach a store that answers "no such plan" rather than "no such product" — a 404 that looks
 * like missing data instead of a wiring mistake. It is also what `requireProduct` is handed at the
 * mount, so the tag the guard admits and the tag the services read are the same value.
 */
export const PRODUCT: Product = 'macroplan'
