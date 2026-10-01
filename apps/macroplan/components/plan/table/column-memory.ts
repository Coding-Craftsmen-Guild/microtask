import { DEFAULT_ORDER, orderFrom } from './columns'

const ORDER_KEY = 'mp-table-columns'

/**
 * The column order this browser last chose, or the default.
 *
 * ### Why every access is wrapped
 *
 * `localStorage` throws rather than returning nothing in several ordinary situations — a browser set to
 * block site data, a private window on some engines, a storage quota that is full. A table that failed to
 * render because it could not remember a column order would be a worse product than one that opened in
 * the default order, so both halves swallow and the default is the answer.
 *
 * What comes back is never trusted: `orderFrom` rebuilds it from the columns that exist. It is a value
 * that survives a deploy and can be edited from a console, and the two failures it would otherwise cause
 * are a header one cell short of its rows, and a column a reader has no way to bring back.
 */
export const remembered = (): readonly string[] => {
  try {
    return orderFrom(window.localStorage.getItem(ORDER_KEY))
  } catch {
    return DEFAULT_ORDER
  }
}

/**
 * Keeps a column order for this browser.
 *
 * The one thing about how the table is read that is remembered at all. A search, a filter and a sort are
 * how somebody reads a plan for ten seconds — `labels/group-css.ts` makes the same call about a chosen
 * group — and a column order is not: it is a layout preference, set once because of what this reader does
 * with this plan, and having to set it again every visit is the whole reason tables remember it.
 */
export const remember = (order: readonly string[]): void => {
  try {
    window.localStorage.setItem(ORDER_KEY, order.join(','))
  } catch {
    return
  }
}
