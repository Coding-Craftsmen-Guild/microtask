import type { ReactNode } from 'react'
import { PLAN_ROOT_SLOT, SHELL } from './shell-css'

/** Props for {@link PlanShell}. */
export interface PlanShellProps {
  /** The title row: the plan's name, its calendar, the view switch and the whole-plan actions. */
  readonly head: ReactNode

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
 * The plan page's frame: one strip over two panes that scroll independently.
 *
 * Every region is a sibling and every one of them says how it shrinks, so no child can push another
 * off the page. {@link SHELL} carries the reasoning for the shape.
 *
 * ### What left
 *
 * The **toolbar** region did, into the head row above it: two strips, each with its own padding and
 * its own bottom border, put 60-odd pixels of chrome between a plan's name and its first bar and
 * divided them at a line no reader could see a reason for. `shell-css.ts` carries that argument.
 */
export function PlanShell({ head, sidebar, children, drawer }: PlanShellProps) {
  return (
    <div className={SHELL.root} data-slot={PLAN_ROOT_SLOT}>
      <div className={SHELL.head}>{head}</div>
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
