/** The products sharing this API, each with its own entities and data root. */
export const PRODUCTS = ['microtask', 'macroplan'] as const

/** One of the products sharing this API. */
export type Product = (typeof PRODUCTS)[number]

/** Narrows a value to a known product name. */
export const isProduct = (value: unknown): value is Product =>
  typeof value === 'string' && (PRODUCTS as readonly string[]).includes(value)
