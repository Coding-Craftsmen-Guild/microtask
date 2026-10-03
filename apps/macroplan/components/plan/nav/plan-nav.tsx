'use client'

import { createContext, useContext } from 'react'
import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { plainClick } from '../canvas/pointer-view'

/** How the plan screen moves between its own addresses: a drawer opened, a tab closed. */
export interface PlanNav {
  /** Show this address, as a new history entry or in place of the current one. */
  readonly go: (href: string, options?: { readonly replace?: boolean }) => void
}

const revealed = (href: string): void => {
  const at = href.indexOf('#')
  if (at < 0) return
  const id = decodeURIComponent(href.slice(at + 1))
  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' })),
  )
}

/**
 * Moving between the plan's own addresses without asking the server for anything (ADR 0069).
 *
 * Next mirrors a native `pushState` into its router — `usePathname` and `useSearchParams` follow it, and
 * Back steps out of it — so a drawer's address changes the way a route change would, and the drawer, which
 * reads the address (`./drawer-route.ts`), draws itself from the plan the browser already holds. Nothing is
 * fetched, so there is no round trip and no Suspense fallback whose reveal React would hold back.
 *
 * A `#fragment` is scrolled to once the drawer has drawn, which is what a navigation used to do on its own:
 * the table's "Add item" and "Delete" open the drawer at the control they name.
 */
export const SHALLOW: PlanNav = {
  go: (href, options) => {
    if (options?.replace === true) window.history.replaceState(null, '', href)
    else window.history.pushState(null, '', href)
    revealed(href)
  },
}

const PlanNavContext = createContext<PlanNav>(SHALLOW)

/** Hands a screen its navigation; the plan screen uses {@link SHALLOW}, and a test can hand a spy. */
export const PlanNavProvider = PlanNavContext.Provider

/**
 * The navigation the plan screen moves with.
 *
 * @returns The provided one, or {@link SHALLOW} outside a provider.
 */
export const usePlanNav = (): PlanNav => useContext(PlanNavContext)

/** Props for {@link PlanLink}: an anchor's own, with the address required. */
export interface PlanLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string

  /** Replace the current history entry rather than adding one, as closing a tab does. */
  readonly replace?: boolean
}

/**
 * A link to one of the plan's own addresses, which opens without a request.
 *
 * A real `<a href>`, so a modified click, a middle click and "Open in new tab" all still do what a reader
 * expects; only a plain click is taken over and turned into a {@link PlanNav.go}. It replaces `next/link`
 * on the plan screen, whose every click was a server render of the page segment and whose prefetch of each
 * link on screen was a server render too.
 */
export function PlanLink({ href, replace = false, onClick, ...anchor }: PlanLinkProps) {
  const { go } = usePlanNav()
  const open = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event)
    if (!plainClick(event) || anchor.target === '_blank') return
    event.preventDefault()
    go(href, { replace })
  }
  return <a {...anchor} href={href} onClick={open} />
}
