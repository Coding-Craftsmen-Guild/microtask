'use client'

import { useRef, useState } from 'react'

const BOX =
  'w-full rounded-md border border-border bg-background px-2 py-1 text-[13px] outline-none focus-visible:border-brand'

const ROW = '[data-slot="sidebar-row"]'

const BRANCH = '[data-slot="rail-branch"]'

/** Props for {@link SidebarSearch}. */
export interface SidebarSearchProps {
  /** The field's accessible label, so the sidebar's words all live in one record. */
  readonly label: string

  /** Its placeholder, which is the only hint a one-field form gets. */
  readonly hint: string
}

const matches = (row: Element, needle: string): boolean =>
  needle === '' || (row.getAttribute('data-search') ?? '').includes(needle)

/**
 * Filters the rail tree by name, by hiding the rows that do not match.
 *
 * ### Why it walks the DOM instead of filtering a list
 *
 * A client component under `components/plan` may be handed primitives, an unbound function or `null` and
 * nothing else — `../module-boundaries.test.tsx` enforces it, so that nothing about a plan can cross into a
 * client boundary and reach the Flight payload (ADR 0033). An array of rails is none of those. So the tree
 * stays server-rendered and this reads what the server drew, exactly as `canvas/selection.ts` rebuilds a
 * whole `RailBox[]` out of the SVG for the same reason: "the drag rebuilds the `RailBox[]` it hands
 * `dropTargetFor` out of the markup the server drew."
 *
 * The alternative — making the tree a client component — would put every rail and feature name into the
 * payload to save a `querySelectorAll`, and would make a plan's shape reachable from a `'use client'` module
 * for the sake of a text filter.
 *
 * ### Why it is search and not a link
 *
 * Every other selection on this surface is a URL, and this one is not, deliberately. A filter is how
 * somebody finds a row in the next two seconds; it is not a view worth sending to a colleague, and
 * `group-css.ts` makes the same call for choosing a group. Nothing is navigated, so nothing re-renders and
 * the graph beside it does not flicker while somebody types.
 *
 * ### What it hides, and what it leaves alone
 *
 * A row whose name does not contain what was typed gets `hidden`. A **branch** — a rail and its features —
 * is hidden only when nothing inside it matched, so searching a feature's name leaves its rail visible above
 * it and the result reads as a tree rather than as a flat list of orphans. Matching is
 * `includes` on two already-lower-cased strings: the rows carry `data-search` pre-lowered by the server, so
 * two hundred names are not lower-cased on every keystroke.
 *
 * ### Why `hidden` and not a class
 *
 * `hidden` is the attribute the platform has for this, it needs no CSS to be emitted, and it takes a row out
 * of the accessibility tree as well as out of the layout — which a filtered-out row should be. A class would
 * have to be a literal Tailwind can see, and toggling one imperatively would then be a second way of saying
 * "not shown" beside the one the platform already has.
 *
 * The input is **uncontrolled** as far as the rows are concerned — React holds the typed text so the field
 * repaints, and the rows are touched directly — because the rows are not React's to own: the server rendered
 * them, and a re-render that replaced them would undo the filter.
 */
export function SidebarSearch({ label, hint }: SidebarSearchProps) {
  const [typed, setTyped] = useState('')
  const box = useRef<HTMLInputElement>(null)

  const filter = (value: string): void => {
    setTyped(value)
    const root = box.current?.closest('[data-slot="plan-sidebar"]')
    if (!root) return
    const needle = value.trim().toLowerCase()
    for (const branch of root.querySelectorAll(BRANCH)) {
      const rows = [...branch.querySelectorAll(ROW)]
      for (const row of rows) if (row instanceof HTMLElement) row.hidden = !matches(row, needle)
      const shown = rows.some((row) => matches(row, needle))
      if (branch instanceof HTMLElement) branch.hidden = !shown
    }
  }

  return (
    <input
      aria-label={label}
      className={BOX}
      onChange={(event) => filter(event.target.value)}
      placeholder={hint}
      ref={box}
      type="search"
      value={typed}
    />
  )
}
