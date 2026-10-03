import { useEffect, useState, type MouseEvent } from 'react'
import { DEFAULT_ORDER, moveColumn } from './columns'
import { remember, remembered } from './column-memory'
import { nextSort, type Narrowed, type Sorted } from './table-order'

const SEARCH = '[data-slot="table-search"]'

const FILTER = '[data-slot="table-filter"]'

const SORT = '[data-sort-col]'

const MOVE = '[data-move]'

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

const kept = (order: readonly string[]): readonly string[] => {
  remember(order)
  return order
}

/** The four things a reader decides about the table, and the two listeners that hear them decided. */
export interface TableState {
  readonly narrowed: Narrowed
  readonly sorted: Sorted | null
  readonly order: readonly string[]

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
 * Hiding a **column** is not here, as it never was: a checkbox and a `:has()` rule per column
 * (`./table-css.ts`) do it with no state at all. The column **order** is the one thing remembered, because
 * a layout is a preference and a search is a question — `./column-memory.ts` carries that argument.
 *
 * @returns The state, and the listeners that set it.
 */
export function useTableState(): TableState {
  const [narrowed, setNarrowed] = useState<Narrowed>(NOTHING)
  const [sorted, setSorted] = useState<Sorted | null>(null)
  const [order, setOrder] = useState<readonly string[]>(DEFAULT_ORDER)
  useEffect(() => {
    setOrder(remembered())
  }, [])
  const onInput = (event: { readonly target: EventTarget | null }): void => {
    setNarrowed((was) => narrowedBy(was, event.target))
  }
  const onClick = (event: MouseEvent<HTMLElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    const column = target?.closest(SORT)?.getAttribute('data-sort-col') ?? null
    if (column !== null) setSorted((was) => nextSort(was, column))
    const asked = movedBy(target)
    if (asked !== null) setOrder((was) => kept(moveColumn(was, asked.key, asked.by)))
  }
  return { narrowed, sorted, order, onInput, onClick }
}
