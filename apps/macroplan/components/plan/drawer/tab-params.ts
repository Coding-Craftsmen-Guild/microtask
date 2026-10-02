import { OPEN_PARAM } from './tab-stack'

/** What a page is handed as its query, which is a string, a list of them, or nothing. */
export type SearchParams = Record<string, string | readonly string[] | undefined>

/**
 * The open-tab parameter, from a query a URL can repeat a key in.
 *
 * `?open=a&open=b` arrives as an array, and the first one is what a reader typed first — the rest are a
 * malformed URL rather than a second stack, so the first is used and the others dropped. Anything absent
 * is a drawer opened on its own, which is one tab.
 *
 * @param search - The page's own query.
 * @returns The parameter's value, or `undefined` for a drawer with no stack.
 */
export const openParam = (search: SearchParams): string | undefined => {
  const held = search[OPEN_PARAM]
  return Array.isArray(held) ? held[0] : (held as string | undefined)
}
