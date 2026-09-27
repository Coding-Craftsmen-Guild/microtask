import type { ReactNode } from 'react'
import { DRAWER, DrawerBody, DrawerHead, DrawerScrim, TITLE_ID } from './drawer-dock'

/** Props for {@link DrawerShell}. */
export interface DrawerShellProps {
  readonly title: string

  /** What kind of thing is open, over the title. Nothing where the title already says. */
  readonly kind?: string | null

  readonly closeHref: string

  readonly children: ReactNode
}

/**
 * The dock the form drawers open in: a rail, a group, the plan's settings, its seats.
 *
 * `DrawerPanel` is the other one, for a feature or an item. The two differ only in what fills the
 * body — a heading built from a table row against a title handed in — and both take their chrome
 * from `drawer-dock.ts`, which is what keeps the scrim, the title bar and the way out the same
 * whichever route is open.
 */
export function DrawerShell({ title, kind = null, closeHref, children }: DrawerShellProps) {
  return (
    <>
      <DrawerScrim closeHref={closeHref} />
      <aside aria-labelledby={TITLE_ID} className={DRAWER.dock} data-slot="drawer-shell">
        <DrawerHead closeHref={closeHref} kind={kind} title={title} />
        <DrawerBody>{children}</DrawerBody>
      </aside>
    </>
  )
}
