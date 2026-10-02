import type { ReactNode } from 'react'
import { DrawerDock, PlainTab } from './drawer-dock'
import { PANEL_GRID } from './panel-css'

/** Props for {@link DrawerShell}. */
export interface DrawerShellProps {
  readonly title: string

  /** What kind of thing is open, over the title. Nothing where the title already says. */
  readonly kind?: string | null

  readonly closeHref: string

  readonly children: ReactNode
}

/**
 * The panel the form drawers open in: a rail, a group, a new one of either.
 *
 * `DrawerPanel` is the other one, for a feature or an item. The two differ only in what fills the
 * body — a heading built from a table row against a title handed in — and in which tab they draw:
 * this one has no marker, because a rail's form is not a mark on the board and there is no hue to
 * match it to. Both take their chrome from `./drawer-dock.tsx`, which is what keeps six routes
 * opening in one panel rather than in two that drift.
 */
export function DrawerShell({ title, kind = null, closeHref, children }: DrawerShellProps) {
  return (
    <DrawerDock tab={<PlainTab closeHref={closeHref} kind={kind} title={title} />}>
      <div className={PANEL_GRID.root}>
        <div className={PANEL_GRID.column}>{children}</div>
      </div>
    </DrawerDock>
  )
}
