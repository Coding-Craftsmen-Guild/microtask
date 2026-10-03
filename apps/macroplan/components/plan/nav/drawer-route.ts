import { joinTabs, OPEN_PARAM, splitTabs } from '../drawer/tab-stack'

/** Which drawer an address opens beside the plan, or `null` for none. */
export type Selection =
  | { readonly kind: 'feature' | 'item'; readonly id: string; readonly open: string | null }
  | { readonly kind: 'rail' | 'group'; readonly id: string }
  | { readonly kind: 'new-rail'; readonly count: number }
  | { readonly kind: 'new-group' }
  | null

const SUBJECTS: Readonly<Record<string, 'feature' | 'item' | 'rail' | 'group'>> = {
  f: 'feature',
  i: 'item',
  r: 'rail',
  g: 'group',
}

const ADDS: Readonly<Record<string, 'new-rail' | 'new-group'>> = { rail: 'new-rail', group: 'new-group' }

const countOf = (search: Pick<URLSearchParams, 'get'>): number => {
  const read = Number.parseInt(search.get('n') ?? '', 10)
  return Number.isNaN(read) ? 0 : Math.max(0, read)
}

const decoded = (segment: string): string | null => {
  try {
    return decodeURIComponent(segment)
  } catch {
    return null
  }
}

const subject = (letter: string, segment: string, search: Pick<URLSearchParams, 'get'>): Selection => {
  const kind = SUBJECTS[letter]
  const id = decoded(segment)
  if (kind === undefined || id === null || id === '') return null
  if (kind === 'feature' || kind === 'item') return { kind, id, open: search.get(OPEN_PARAM) }
  return { kind, id }
}

/**
 * The drawer an address names, read in the browser.
 *
 * The drawer used to be a route the server rendered (ADR 0057): opening one was a request, a render of the
 * page segment, a read of the plan, and — because the segment had a `loading.tsx` — a reveal React holds
 * back for 300 ms after its fallback. It is still an address, so it can be linked to, reloaded and stepped
 * back through, but the address is now changed with `history.pushState` and read here, and the drawer is
 * drawn from the plan the browser already holds (ADR 0069).
 *
 * The shapes are the routes' own: `/f/<id>` and `/i/<id>` carry the open tabs in `?open=`, `/r/<id>` and
 * `/g/<id>` name a rail and a group, and `/new/rail?n=` and `/new/group` are the two add drawers. An address
 * outside the plan's own root, or one with a segment this does not know, opens nothing.
 *
 * @param root - The plan's own path: `/plans/<id>` or `/s/<token>`.
 * @param pathname - Where the browser is.
 * @param search - Its query.
 * @returns The selection, or `null`.
 */
export function selectionOf(root: string, pathname: string, search: Pick<URLSearchParams, 'get'>): Selection {
  if (pathname !== root && !pathname.startsWith(`${root}/`)) return null
  const [first, second, extra] = pathname.slice(root.length + 1).split('/')
  if (first === undefined || second === undefined || extra !== undefined) return null
  if (first !== 'new') return subject(first, second, search)
  const add = ADDS[second]
  if (add === undefined) return null
  return add === 'new-rail' ? { kind: add, count: countOf(search) } : { kind: add }
}

/** A selection that names something on the plan by its id: a feature, an item, a rail or a group. */
export type Named = Extract<NonNullable<Selection>, { readonly id: string }>

const LETTERS: Readonly<Record<Named['kind'], string>> = { feature: 'f', item: 'i', rail: 'r', group: 'g' }

const answeredTabs = (open: string | null, real: (id: string) => string): string | null =>
  open === null ? null : joinTabs(splitTabs(open).map((tab) => ({ ...tab, id: real(tab.id) })))

/**
 * A selection with every id it names read through the store: its subject, and each open tab.
 *
 * Something created a moment ago is drawn under a placeholder, and a drawer opened on it then names that
 * placeholder in its address. Once the create has been answered the store reads the placeholder as the real
 * id (`../store/plan-store.ts`), and this is the drawer reading its own address the same way — so it goes on
 * finding its subject, and its tabs theirs, after the answer has replaced the placeholder on the plan.
 *
 * @param selection - The selection the address names.
 * @param real - The store's `real`.
 * @returns The very same selection when none of its ids has been answered, or one naming the real ids.
 */
export function answeredSelection(selection: Selection, real: (id: string) => string): Selection {
  if (selection === null || !('id' in selection)) return selection
  const id = real(selection.id)
  if (!('open' in selection)) return id === selection.id ? selection : { ...selection, id }
  const open = answeredTabs(selection.open, real)
  return id === selection.id && open === selection.open ? selection : { ...selection, id, open }
}

/**
 * Where a selection is opened: {@link selectionOf} the other way round, for every drawer that names
 * something. A feature's or an item's carries its open tabs; the id is encoded, as every route builder does.
 *
 * @param root - The plan's own path: `/plans/<id>` or `/s/<token>`.
 * @param selection - The drawer and what it names.
 * @returns The address it is at.
 */
export function addressOf(root: string, selection: Named): string {
  const path = `${root}/${LETTERS[selection.kind]}/${encodeURIComponent(selection.id)}`
  return 'open' in selection && selection.open !== null ? `${path}?${OPEN_PARAM}=${selection.open}` : path
}
