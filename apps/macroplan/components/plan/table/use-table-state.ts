import { useEffect, useState, type MouseEvent } from 'react'
import { DEFAULT_ORDER, moveColumn } from './columns'
import { remember, remembered } from './column-memory'
import { narrowingIn, nextSort, type Narrowed, type Sorted } from './table-order'

const SEARCH = '[data-slot="table-search"]'

const FILTER = '[data-slot="table-filter"]'

const SORT = '[data-sort-col]'

const MOVE = '[data-move]'

const COLUMN_ROW = '[data-slot="column-row"]'

const NONE_HIDDEN: readonly string[] = []

type Offered = Parameters<typeof narrowingIn>[1]

const NOTHING: Narrowed = { needle: '', rail: '', group: '' }

const narrowedBy = (was: Narrowed, target: EventTarget | null): Narrowed => {
  if (target instanceof HTMLInputElement && target.closest(SEARCH) !== null) {
    return { ...was, needle: target.value.trim().toLowerCase() }
  }
  if (!(target instanceof HTMLSelectElement) || target.closest(FILTER) === null) return was
  const which = target.getAttribute('data-filter') === 'rail' ? 'rail' : 'group'
  return { ...was, [which]: target.value }
}

const movedBy = (target: Element | null): { readonly key: string; readonly by: -1 | 1 } | null => {
  const moving = target?.closest(MOVE) ?? null
  const key = moving?.getAttribute('data-col-key') ?? null
  if (moving === null || key === null) return null
  return { key, by: moving.getAttribute('data-move') === '1' ? 1 : -1 }
}

const hiddenBy = (was: readonly string[], target: EventTarget | null): readonly string[] => {
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || target.closest(COLUMN_ROW) === null) {
    return was
  }
  const key = target.value
  if (target.checked) return was.includes(key) ? was.filter((one) => one !== key) : was
  return was.includes(key) ? was : [...was, key]
}

const kept = (order: readonly string[]): readonly string[] => {
  remember(order)
  return order
}

/** The four things a reader decides about the table, and the two listeners that hear them decided. */
export interface TableState {
  readonly narrowed: Narrowed
  readonly sorted: Sorted | null
  readonly order: readonly string[]

  /** The columns the reader has unchecked, by key — what the table states as `data-hide` for its sheet. */
  readonly hidden: readonly string[]

  /** The search box and the two filters, heard where they bubble to. */
  readonly onInput: (event: { readonly target: EventTarget | null }) => void

  /** A header's sort button and a column's move buttons. */
  readonly onClick: (event: MouseEvent<HTMLElement>) => void
}

/**
 * The table's search, filters, sort and column order, as state the table renders from.
 *
 * They used to be applied to the DOM after every render (`table-root.tsx`, before ADR 0069), because the
 * rows were the server's and every re-render of the layout put them back in the derived order. The table
 * is drawn in the browser now, so these are simply what it renders from (`./table-order.ts`), and the
 * controls are still heard by delegation: one listener for the whole toolbar and header.
 *
 * Hiding a **column** is a list of keys, heard off its checkbox and stated as `data-hide` on the table's
 * root, which one rule per column reads (`./table-css.ts`), so no row re-renders for it. The column
 * **order** is the one thing remembered, because
 * a layout is a preference and a search is a question — `./column-memory.ts` carries that argument.
 *
 * A rail or a group filtered by and then deleted leaves its select, which then reads as every one; the
 * state lets go of it then too (`narrowingIn`), so the rows and the select say the same thing.
 *
 * @param offered - The plan's rails and groups, which the two filters offer.
 * @returns The state, and the listeners that set it.
 */
export function useTableState(offered: Offered): TableState {
  const [chosen, setNarrowed] = useState<Narrowed>(NOTHING)
  const narrowed = narrowingIn(chosen, offered)
  if (narrowed !== chosen) setNarrowed(narrowed)
  const [sorted, setSorted] = useState<Sorted | null>(null)
  const [order, setOrder] = useState<readonly string[]>(DEFAULT_ORDER)
  const [hidden, setHidden] = useState<readonly string[]>(NONE_HIDDEN)
  useEffect(() => {
    setOrder(remembered())
  }, [])
  const onInput = (event: { readonly target: EventTarget | null }): void => {
    setNarrowed((was) => narrowedBy(was, event.target))
    setHidden((was) => hiddenBy(was, event.target))
  }
  const onClick = (event: MouseEvent<HTMLElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    const column = target?.closest(SORT)?.getAttribute('data-sort-col') ?? null
    if (column !== null) setSorted((was) => nextSort(was, column))
    const asked = movedBy(target)
    if (asked !== null) setOrder((was) => kept(moveColumn(was, asked.key, asked.by)))
  }
  return { narrowed, sorted, order, hidden, onInput, onClick }
}
