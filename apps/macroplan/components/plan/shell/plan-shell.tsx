import type { ReactNode } from 'react'
import { PLAN_ROOT_SLOT, SHELL } from './shell-css'

/** Props for {@link PlanShell}. */
export interface PlanShellProps {
  /** The title row: the plan's name, its calendar, the view switch and the whole-plan actions. */
  readonly head: ReactNode

  /** The timeline or the table, whichever the view switch has on screen. */
  readonly children: ReactNode

  /**
   * Whatever route is open beneath the plan, which is a panel and no longer an overlay.
   *
   * Last, and a **flex child** rather than a `fixed` box: the panel declares its own height and
   * `shrink-0`, the body above it is `flex-1 min-h-0`, so opening one makes the board shorter instead
   * of covering it. That is the whole of the change — `drawer/panel-css.ts` carries why a dock over
   * the plan was the wrong shape for a page whose point is that a plan is read while it is changed.
   */
  readonly drawer: ReactNode
}

/**
 * The plan page's frame: one strip over one pane.
 *
 * Every region is a sibling and every one of them says how it shrinks, so no child can push another
 * off the page. {@link SHELL} carries the reasoning for the shape.
 *
 * ### What left
 *
 * The **toolbar** region did, into the head row above it: two strips, each with its own padding and
 * its own bottom border, put 60-odd pixels of chrome between a plan's name and its first bar and
 * divided them at a line no reader could see a reason for. `shell-css.ts` carries that argument.
 *
 * The **sidebar** region did too, and that is the larger change. The rail tree was a 17.5rem pane
 * scrolling beside the board, so a reader scrolling the plan down scrolled the tree out of step with
 * the bands it was naming — two columns of the same rails at two offsets. The rails are a sticky
 * column *inside* the board's own scroller now (`board/rail-column.tsx`), which makes a rail's name
 * being beside its band structural rather than two panes agreeing about a row height.
 */
export function PlanShell({ head, children, drawer }: PlanShellProps) {
  return (
    <div className={SHELL.root} data-slot={PLAN_ROOT_SLOT}>
      <div className={SHELL.head}>{head}</div>
      <div className={SHELL.body}>
        <div className={SHELL.main} data-slot="plan-main">
          {children}
        </div>
      </div>
      {drawer}
    </div>
  )
}
