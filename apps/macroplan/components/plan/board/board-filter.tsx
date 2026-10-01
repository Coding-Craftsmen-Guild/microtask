'use client'

import { useRef, useState } from 'react'
import { CORNER } from './board-css'
import { FADED, SEARCHABLE } from './filter-css'

/** Props for {@link BoardFilter}. */
export interface BoardFilterProps {
  /** The field's accessible label, so the board's words all live in one record. */
  readonly label: string

  /** Its placeholder, which is the only hint a one-field control gets. */
  readonly hint: string
}

const BOARD = '[data-slot="plan-board"]'

const matches = (node: Element, needle: string): boolean =>
  needle === '' || (node.getAttribute('data-search') ?? '').includes(needle)

/**
 * Filters the board by name: every rail and every feature that does not match goes faint.
 *
 * ### Why it dims rather than hides
 *
 * The one real constraint on this page, stated plainly: **the canvas's geometry is computed on the
 * server**. Every lane is at a y the layout fixed, every bar at an x and a width the schedule fixed,
 * and nothing in the browser recomputes any of it — that is what keeps a 2,000-mark plan a Server
 * Component (ADR 0057). Hiding a rail would therefore leave a lane-shaped hole with the rails below
 * it still at their old y, and hiding a bar would leave a gap in a run that is scheduled back to
 * back. A filter that removes rows needs a layout that reflows, and this one deliberately does not
 * have one.
 *
 * Dimming needs no reflow and is the language this page already speaks: a group chip dims everything
 * outside the chosen group, a selected rail dims the others. So typing in this box is the third of
 * the same gesture — what matches stays, what does not goes quiet and stays where it is, which also
 * means a reader can still see *where* in the plan the matches are.
 *
 * ### Why it walks the DOM instead of filtering a list
 *
 * A client component under `components/plan` may be handed primitives, an unbound function or `null`
 * and nothing else — `../module-boundaries.test.tsx` enforces it, so that nothing about a plan can
 * cross into a client boundary and reach the Flight payload (ADR 0033). An array of rails is none of
 * those. So the board stays server-rendered and this reads what the server drew, exactly as
 * `canvas/selection.ts` rebuilds a whole `RailBox[]` out of the SVG for the same reason.
 *
 * Matching is `includes` on two already-lower-cased strings: the rows and the marks carry
 * `data-search` pre-lowered by the server, so two hundred names are not lower-cased on every
 * keystroke.
 *
 * ### Why it is search and not a link
 *
 * Every other selection on this surface is a URL, and this one is not, deliberately. A filter is how
 * somebody finds a row in the next two seconds; it is not a view worth sending to a colleague, and
 * `labels/group-css.ts` makes the same call for choosing a group. Nothing is navigated, so nothing
 * re-renders and the board does not flicker while somebody types.
 *
 * The input is **uncontrolled** as far as the board is concerned — React holds the typed text so the
 * field repaints, and the marks are touched directly — because the marks are not React's to own: the
 * server rendered them, and a re-render that replaced them would undo the filter.
 */
export function BoardFilter({ label, hint }: BoardFilterProps) {
  const [typed, setTyped] = useState('')
  const box = useRef<HTMLInputElement>(null)

  const filter = (value: string): void => {
    setTyped(value)
    const root = box.current?.closest(BOARD)
    if (!root) return
    const needle = value.trim().toLowerCase()
    for (const node of root.querySelectorAll(SEARCHABLE)) {
      if (matches(node, needle)) node.removeAttribute(FADED)
      else node.setAttribute(FADED, '')
    }
  }

  return (
    <input
      aria-label={label}
      className={CORNER.filter}
      data-slot="board-filter"
      onChange={(event) => filter(event.target.value)}
      placeholder={hint}
      ref={box}
      type="search"
      value={typed}
    />
  )
}
