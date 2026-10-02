import type { SubjectKind } from './values'

const BETWEEN = ','

const WITHIN = ':'

const LETTERS: Readonly<Record<SubjectKind, string>> = { feature: 'f', item: 'i' }

/** The query parameter the open tabs ride in, beside the route of the active one. */
export const OPEN_PARAM = 'open'

/** One open tab: which kind of subject, and which one. */
export interface TabRef {
  /** A feature or an item, which is also the segment its route is spelled with. */
  readonly kind: SubjectKind

  /** The subject's id. */
  readonly id: string
}

const letterOf = (kind: SubjectKind): string => LETTERS[kind]

const kindOf = (letter: string): SubjectKind | null => {
  if (letter === LETTERS.feature) return 'feature'
  return letter === LETTERS.item ? 'item' : null
}

/** Whether two tabs name the same subject. */
export const sameTab = (one: TabRef, other: TabRef): boolean =>
  one.kind === other.kind && one.id === other.id

/**
 * The stack as it rides in the URL: `f:<id>,i:<id>`, in the order the tabs are drawn.
 *
 * Two letters and a comma rather than JSON, because this is a URL a reader can see and sometimes edits:
 * `?open=f:01J…,i:01J…` says what it is at a glance, and it survives being copied out of a chat message
 * where a brace or a quote would not.
 *
 * @param stack - The tabs, in order.
 * @returns The parameter's value, or `''` for a stack of none.
 */
export const joinTabs = (stack: readonly TabRef[]): string =>
  stack.map((tab) => `${letterOf(tab.kind)}${WITHIN}${tab.id}`).join(BETWEEN)

/**
 * The stack read back, dropping anything that is not a tab this product has.
 *
 * A URL is typed by people and outlives deploys, so an entry with no letter, an unknown letter or no id
 * is skipped rather than throwing: the rest of the stack is still what somebody meant.
 *
 * @param open - Whatever arrived as the `open` parameter.
 * @returns One ref per readable entry, in the order they were written.
 */
export function splitTabs(open: string | undefined): readonly TabRef[] {
  if (open === undefined || open === '') return []
  return open.split(BETWEEN).flatMap((entry) => {
    const at = entry.indexOf(WITHIN)
    const kind = kindOf(entry.slice(0, at))
    const id = entry.slice(at + 1)
    return at < 0 || kind === null || id === '' ? [] : [{ id, kind }]
  })
}

/**
 * The whole stack a panel draws: what the URL holds, with the subject the **route** names in it.
 *
 * The active tab is the route and not a parameter, which is what keeps a drawer deep-linkable: a link to
 * `/plans/<id>/f/<id>` opens that feature whether or not anything else is in the stack. So the parameter
 * carries the *rest*, and this folds the two together — appending the active tab where the parameter has
 * not got it, and leaving it where it has, so switching tabs does not reorder them.
 *
 * @param open - The `open` parameter.
 * @param active - The subject the route names.
 * @returns The tabs, in the order they are drawn.
 */
export function tabStack(open: string | undefined, active: TabRef): readonly TabRef[] {
  const held = splitTabs(open).filter((tab) => !sameTab(tab, active))
  const at = splitTabs(open).findIndex((tab) => sameTab(tab, active))
  if (at < 0) return [...held, active]
  return [...held.slice(0, at), active, ...held.slice(at)]
}

/** Where one tab goes when it is clicked: its own route, carrying the stack it is part of. */
export const tabHref = (root: string, tab: TabRef, stack: readonly TabRef[]): string =>
  `${root}/${letterOf(tab.kind)}/${encodeURIComponent(tab.id)}?${OPEN_PARAM}=${joinTabs(stack)}`

/**
 * Where closing one tab goes: the stack with that tab gone, or the plan itself for the last one.
 *
 * Closing a tab that is **not** the active one leaves the panel where it is — the reader closed something
 * they were not reading. Closing the active one opens the tab beside it rather than the plan, which is
 * what a tab strip means everywhere else: the thing that closes a panel is closing the last tab in it.
 * Which one is beside it is the one after, or the one before where it was last — the answer an editor
 * gives.
 *
 * @param root - The plan's own path.
 * @param closing - The tab being closed.
 * @param stack - The stack it is in.
 * @param active - The tab the panel is drawing.
 * @returns The address to go to.
 */
export function closedHref(
  root: string,
  closing: TabRef,
  stack: readonly TabRef[],
  active: TabRef,
): string {
  const left = stack.filter((tab) => !sameTab(tab, closing))
  const at = stack.findIndex((tab) => sameTab(tab, closing))
  const next = sameTab(closing, active) ? left[Math.min(at, left.length - 1)] : active
  return next === undefined ? root : tabHref(root, next, left)
}

/**
 * Where a click on the board goes: the subject it opened, added to the stack already open.
 *
 * A subject already in the stack is **not** added twice — the click selects the tab it is in, which is
 * what a reader means by clicking the mark of something already open.
 *
 * @param root - The plan's own path.
 * @param opening - The subject that was clicked.
 * @param stack - What is open now.
 * @returns The address to go to.
 */
export const openedHref = (root: string, opening: TabRef, stack: readonly TabRef[]): string =>
  tabHref(root, opening, tabStack(joinTabs(stack), opening))

const SEGMENT = '/'

const DRAWER_SEGMENTS: readonly string[] = ['f', 'i', 'r', 'g', 'new']

/**
 * The plan's own path, from whatever address the browser is on.
 *
 * The one thing a client component may read a seat's token out of is the **address bar**: it is already
 * in the browser, it was not handed over as a prop, and nothing server-side put it there (ADR 0033 is
 * about what crosses the boundary). So a mark that is not an anchor — an item, whose link would cost two
 * thousand elements at the cap — still has a route to open, worked out from where the reader already is.
 *
 * A drawer is one of five known segments followed by one more, so the path is cut before it. Anything
 * else is the plan's own page, which is already the root.
 *
 * @param pathname - `location.pathname`, which is `/plans/<id>`, `/s/<token>` or one drawer under either.
 * @returns The plan's path, with no drawer on the end of it.
 */
export function planRootOf(pathname: string): string {
  const parts = pathname.split(SEGMENT)
  const at = parts.length - 2
  const segment = parts[at] ?? ''
  return DRAWER_SEGMENTS.includes(segment) ? parts.slice(0, at).join(SEGMENT) : pathname
}

/**
 * The same address a mark on the board already links to, with the open stack added to it.
 *
 * The board is drawn by a **layout**, and a layout cannot read the query (Next's own rule), so the links
 * on two thousand marks cannot be built with the stack in them. The click is where that is put right: the
 * href is already the right route, and this is the one function that rewrites it.
 *
 * An address this cannot read — a rail, a group, a make-one form — comes back **unchanged**, which is
 * exactly right: those routes are not tabs, so opening one closes the stack rather than joining it.
 *
 * @param href - Where the mark links: `<root>/f/<id>` or `<root>/i/<id>`.
 * @param open - The `open` parameter as it is now, or `null` for none.
 * @returns The address to push.
 */
export function stackedHref(href: string, open: string | null): string {
  const cut = href.lastIndexOf(SEGMENT)
  const letter = href.slice(href.lastIndexOf(SEGMENT, cut - 1) + 1, cut)
  const kind = kindOf(letter)
  const id = decodeURIComponent(href.slice(cut + 1))
  if (kind === null || id === '') return href
  const root = href.slice(0, href.lastIndexOf(SEGMENT, cut - 1))
  return openedHref(root, { id, kind }, splitTabs(open ?? undefined))
}
