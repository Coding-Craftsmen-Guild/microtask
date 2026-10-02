'use client'

import { useEffect, useRef } from 'react'
import type { PointerEvent } from 'react'
import { PANEL, PANEL_HEIGHT, PANEL_SIZE, PANEL_STORE } from './panel-css'

const clamp = (height: number): number =>
  Math.min(Math.max(Math.round(height), PANEL_SIZE.min), PANEL_SIZE.max)

const apply = (height: number): void => {
  document.documentElement.style.setProperty(PANEL_HEIGHT, `${String(height)}px`)
}

const remembered = (): number | null => {
  const stored = Number(window.localStorage.getItem(PANEL_STORE))
  return Number.isFinite(stored) && stored > 0 ? clamp(stored) : null
}

/** Props for {@link PanelGrip}. */
export interface PanelGripProps {
  /** The grip's accessible name, so the panel's words all live in one record. */
  readonly label: string
}

/**
 * The bar along the top of the panel that drags it taller or shorter.
 *
 * ### Why it writes a CSS property and not state
 *
 * `./panel-css.ts` carries it in full: the panel and the board above it are server-rendered, so a
 * height held in React would re-render a tree of two thousand marks on every pointer move. One
 * property on `<html>`, written straight to the DOM, costs a relayout and nothing else — and it
 * survives the router replacing the panel's contents, which a `useState` in the panel would not.
 *
 * ### Why it captures the pointer
 *
 * A resize that lost the pointer the moment it left the 10px grip would be a resize nobody could
 * finish. `setPointerCapture` keeps every move coming here until the button is released, which is
 * also what makes a drag that ends outside the window end cleanly. `DragRoot` deliberately does not
 * capture, and the difference is the gesture: a drop has to be *refusable* by leaving the board, and
 * a resize has nowhere to be refused.
 *
 * ### Why it measures the pointer and not the panel
 *
 * The new height is the distance from the pointer to the bottom of the window, which needs no
 * measurement of the panel at all — one subtraction against `innerHeight`. Reading the panel's own
 * rect every frame would be a forced layout per move, and `happy-dom` answers every rect with zero,
 * so it would also be the one line no test here could check. **This is the browser-verification item
 * this change hands forward:** drag the grip and check the panel follows the pointer rather than
 * jumping or inverting.
 *
 * ### What a keyboard gets
 *
 * Arrow keys, on the same control. It is a `<button>` with `aria-label` rather than a bare `<div>`
 * for that reason: a pointer-only resize is a control a keyboard user does not have, which is the
 * same objection `drag-root.tsx` answers by pointing at the drawer's own Move buttons. There is no
 * equivalent elsewhere for this one, so it is here.
 */
export function PanelGrip({ label }: PanelGripProps) {
  const held = useRef(false)

  useEffect(() => {
    const stored = remembered()
    if (stored !== null) apply(stored)
  }, [])

  const settle = (height: number): void => {
    apply(height)
    window.localStorage.setItem(PANEL_STORE, String(height))
  }

  const move = (event: PointerEvent<HTMLButtonElement>): void => {
    if (!held.current) return
    apply(clamp(window.innerHeight - event.clientY))
  }

  const stop = (event: PointerEvent<HTMLButtonElement>): void => {
    if (!held.current) return
    held.current = false
    event.currentTarget.releasePointerCapture(event.pointerId)
    settle(clamp(window.innerHeight - event.clientY))
  }

  const nudge = (by: number): void => {
    const now = remembered() ?? PANEL_SIZE.open
    settle(clamp(now + by))
  }

  return (
    <button
      aria-label={label}
      className={PANEL.grip}
      data-slot="panel-grip"
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') nudge(32)
        if (event.key === 'ArrowDown') nudge(-32)
      }}
      onPointerDown={(event) => {
        held.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={move}
      onPointerUp={stop}
      type="button"
    >
      <span className={PANEL.gripPill} />
    </button>
  )
}
