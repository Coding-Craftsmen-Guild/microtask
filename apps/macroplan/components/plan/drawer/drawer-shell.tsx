import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The frame every drawer on this surface is drawn in: a panel down the right-hand edge.
 *
 * ### Why a fixed panel and not a column in the grid
 *
 * Through phase 4 the drawer was a card in the page's own flow, between the conflict list and the
 * timeline, so opening a feature pushed the whole graph down the page — the one thing a reader was
 * looking at moved because they asked to see something beside it. A panel pinned to the edge leaves the
 * canvas where it is.
 *
 * It is still **not a dialog**. `drawer-panel.tsx` argues that at length and none of it changes here: this
 * is a route, so it claims no `role="dialog"`, traps no focus, and what closes it is a `Link` back to the
 * plan rather than a button — Back, a bookmark and Close all mean the same thing, and none of them needs
 * JavaScript. Fixing its position is a paint decision and not a change of kind.
 *
 * ### One string, used by every drawer
 *
 * A whole class literal, because Tailwind's scanner reads source as plain text and
 * `module-boundaries.test.tsx` refuses a composed one anywhere under `components/plan`. Every drawer —
 * this shell's callers and `DrawerPanel`, which keeps its own `<aside>` for the heading and the two data
 * attributes it carries — uses this one constant, so there is one answer to where a drawer sits and a
 * change to it cannot land on some of them.
 *
 * `overflow-y-auto` and `content-start` because a drawer's height is its content's: a rail with twenty
 * features scrolls inside the panel, and a form with three fields does not stretch to fill it.
 */
export const DRAWER_DOCK =
  'fixed inset-y-0 right-0 z-40 grid w-[min(26rem,100vw)] content-start gap-3 overflow-y-auto border-l bg-card p-4 shadow-xl'

const TITLE = 'text-[15px] font-semibold'

const CLOSE = 'text-[13px] text-brand'

const SHELL_TITLE_ID = 'plan-drawer-title'

/** Props for {@link DrawerShell}. */
export interface DrawerShellProps {
  /** What is open, as a heading — the panel's accessible name. */
  readonly title: string

  /** Where Close goes: the plan's own path on this surface, with nothing open. */
  readonly closeHref: string

  /** The form or forms this drawer carries. */
  readonly children: ReactNode
}

/**
 * A drawer carrying one form, named by its own heading.
 *
 * For the drawers this revision adds — make a rail, edit a rail, make a group, edit a group, plan
 * settings, share — each of which is one subject and one heading. `DrawerPanel` does **not** use it: that
 * panel's heading is `drawer-heading.tsx`'s, with a kind eyebrow and a treatment beside it, and it
 * carries `data-kind` and `data-treatment` that the table and the sweep both read. It shares
 * {@link DRAWER_DOCK} instead, which is the part that has to agree.
 *
 * `children` is markup and never a render function, which is what `module-boundaries.test.tsx` admits
 * across a boundary — and this is a Server Component either way, so nothing here is a boundary at all.
 */
export function DrawerShell({ title, closeHref, children }: DrawerShellProps) {
  return (
    <aside aria-labelledby={SHELL_TITLE_ID} className={DRAWER_DOCK} data-slot="drawer-shell">
      <h2 className={TITLE} id={SHELL_TITLE_ID}>
        {title}
      </h2>
      {children}
      <Link className={CLOSE} href={closeHref}>
        Close
      </Link>
    </aside>
  )
}
