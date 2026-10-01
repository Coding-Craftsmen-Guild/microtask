'use client'

import { useEffect, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { DEFAULT_ORDER, moveColumn } from './columns'
import { remember, remembered } from './column-memory'
import { layColumns, markSorted, narrow, nextSort, reorder, type Narrowed, type Sorted } from './table-order'

const FRAME = 'contents'

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

/** Props for {@link TableRoot}. */
export interface TableRootProps {
  /**
   * The toolbar and the table, server-rendered, handed through untouched.
   *
   * The third component in this app to use the one exception `../module-boundaries.test.tsx` states —
   * markup on `children`, and on no other prop. The controls are built from the plan's own rails and
   * groups and the rows from its whole derived order, none of which may cross this boundary as data.
   */
  readonly children: ReactNode
}

/**
 * Everything about the table that CSS cannot do: hiding rows, ordering rows, and ordering cells.
 *
 * ### What is deliberately **not** here
 *
 * Hiding a **column** is not. That is a checkbox and a `:has()` rule per column (`./table-css.ts`), so it
 * costs no island, survives every re-render on its own, and works with scripting off. The rule is the one
 * ADR 0064 states for selecting a group: if a native control and a generated rule can express it, they do,
 * and a client component is what is left over.
 *
 * What is left over is three things. A row cannot be hidden by CSS because the condition is a substring
 * of an attribute. Rows cannot be reordered by CSS at all. And cells cannot: `order` does not apply to
 * table cells, and the only way around that is to stop being a `<table>`, which would cost the semantics
 * ADR 0056 says this rendering exists for.
 *
 * ### Why the state is here and the DOM is written to in an effect
 *
 * The rows are the **server's**. Opening a drawer re-renders the layout the table sits in, and the server
 * always draws the derived order with nothing hidden — so a filter applied once and forgotten would
 * silently come undone the first time somebody opened a row. Holding the four decisions in React state
 * and re-applying them after every render is what makes them survive that.
 *
 * The three fields are the browser's own — they are server markup, so React never writes a value back
 * to them — and this only mirrors what they say, so that it can be re-applied to rows the server redrew.
 * The split is `sidebar/sidebar-search.tsx`'s: the control is one side of the boundary and the rows are
 * the other, and this is that shape at scale.
 *
 * ### Why the column order is the one thing remembered
 *
 * A search, a filter and a sort are how somebody reads the plan for ten seconds — `labels/group-css.ts`
 * makes the same call about a chosen group, and the point is that none of them is worth a URL. A column
 * order is not that: it is a layout preference, somebody sets it once because of what they do with this
 * plan, and having to set it again on every visit is the whole reason tables remember it. It lives in
 * `localStorage`, which is per browser and per origin, and `orderFrom` refuses to trust what comes back.
 */
export function TableRoot({ children }: TableRootProps) {
  const frame = useRef<HTMLDivElement>(null)
  const [narrowed, setNarrowed] = useState<Narrowed>(NOTHING)
  const [sorted, setSorted] = useState<Sorted | null>(null)
  const [order, setOrder] = useState<readonly string[]>(DEFAULT_ORDER)

  useEffect(() => {
    setOrder(remembered())
  }, [])

  useEffect(() => {
    const root = frame.current
    const body = root?.querySelector('tbody') ?? null
    if (root === null || body === null) return
    layColumns(root, order)
    narrow(body, narrowed)
    reorder(body, sorted)
    markSorted(root, sorted)
  })

  const onInput = (event: { readonly target: EventTarget | null }): void => {
    setNarrowed((was) => narrowedBy(was, event.target))
  }

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target instanceof Element ? event.target : null
    const column = target?.closest(SORT)?.getAttribute('data-sort-col') ?? null
    if (column !== null) setSorted((was) => nextSort(was, column))
    const asked = movedBy(target)
    if (asked !== null) setOrder((was) => kept(moveColumn(was, asked.key, asked.by)))
  }



  return (
    <div className={FRAME} data-slot="table-root" onChange={onInput} onClick={onClick} onInput={onInput} ref={frame}>
      {children}
    </div>
  )
}
