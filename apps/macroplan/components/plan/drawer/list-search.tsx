'use client'

import { useRef, useState } from 'react'
import { PICKER } from './field-css'

const PANEL = '[data-slot="pick-panel"]'

const ROW = '[data-pick-row]'

const SEARCH = 'data-search'

/** Props for {@link ListSearch}. */
export interface ListSearchProps {
  /** What the box is called, since a search with no name is a box nobody can describe. */
  readonly label: string

  /** The placeholder, which is the one hint a 30px box has room for. */
  readonly hint: string
}

/**
 * A search box that hides the rows of the list it sits in.
 *
 * ### Why it filters the DOM rather than holding the list
 *
 * The rows are **server-rendered**, and they have to be: each one carries a rail's name, that rail's
 * hue, the day the schedule has the feature finishing, and whether the edge would close a loop — four
 * readings that each take a second record to answer. A client component holding the list would have to
 * be handed one, and `../module-boundaries.test.tsx` refuses arrays of objects across that boundary for
 * the reason ADR 0033 gives. So the server writes the rows and the search hides the ones that do not
 * match, which is the same arrangement `board/board-filter.tsx` uses over the board's own rows.
 *
 * It hides rather than dims, which is the one difference from that filter. A board is a picture whose
 * shape means something — a hidden lane leaves a lane-shaped hole — where a list is just a list, and a
 * reader searching one wants the matches and nothing else.
 *
 * ### Why `hidden` and not a class
 *
 * `el.hidden` is one attribute the browser already understands, it takes the row out of the
 * accessibility tree as well as off the screen, and it survives a re-render from the router: the rows
 * come back unhidden, which is exactly right, because the list they came back with is a new list.
 */
export function ListSearch({ label, hint }: ListSearchProps) {
  const [typed, setTyped] = useState('')
  const box = useRef<HTMLInputElement>(null)

  const filter = (value: string): void => {
    setTyped(value)
    const panel = box.current?.closest(PANEL)
    if (!panel) return
    const needle = value.trim().toLowerCase()
    for (const row of panel.querySelectorAll(ROW)) {
      if (row instanceof HTMLElement) {
        row.hidden = needle !== '' && !(row.getAttribute(SEARCH) ?? '').includes(needle)
      }
    }
  }

  return (
    <input
      aria-label={label}
      className={PICKER.search}
      data-slot="list-search"
      onChange={(event) => filter(event.target.value)}
      placeholder={hint}
      ref={box}
      type="search"
      value={typed}
    />
  )
}
