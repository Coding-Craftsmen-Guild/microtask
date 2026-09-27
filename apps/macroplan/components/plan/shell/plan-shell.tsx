import type { ReactNode } from 'react'
import { SHELL } from './shell-css'

/** Props for {@link PlanShell}. */
export interface PlanShellProps {
  /** The title row: breadcrumb, plan name, calendar, and whole-plan actions. */
  readonly head: ReactNode

  /** The control strip: which view is on screen, which group is picked, which zoom. */
  readonly toolbar: ReactNode

  /**
   * The rail tree and its filter. Rendered as its own scrolling pane.
   *
   * Passing nothing is allowed and leaves the timeline the whole width, which is the honest
   * rendering of a surface with no navigation rather than the silent column-shuffle a grid gave.
   */
  readonly sidebar: ReactNode

  /** The timeline or the table, whichever the view switch has on screen. */
  readonly children: ReactNode

  /**
   * Whatever route is open beside the plan, positioned by the drawer itself.
   *
   * Last, and outside every scrolling pane: the drawer is `fixed`, so it is laid out against the
   * viewport wherever it sits in the tree, and putting it after the panes keeps it above them
   * without a larger `z-index` than the one it already carries.
   */
  readonly drawer: ReactNode
}

/**
 * The plan page's frame: two fixed strips over two panes that scroll independently.
 *
 * Every region is a sibling and every one of them says how it shrinks, so no child can push another
 * off the page. {@link SHELL} carries the reasoning for the shape.
 */
export function PlanShell({ head, toolbar, sidebar, children, drawer }: PlanShellProps) {
  return (
    <div className={SHELL.root} data-slot="plan-shell">
      <div className={SHELL.head}>{head}</div>
      <div className={SHELL.toolbar}>{toolbar}</div>
      <div className={SHELL.body}>
        {sidebar === null ? null : (
          <aside className={SHELL.side} data-slot="plan-side">
            {sidebar}
          </aside>
        )}
        <div className={SHELL.main} data-slot="plan-main">
          {children}
        </div>
      </div>
      {drawer}
    </div>
  )
}
