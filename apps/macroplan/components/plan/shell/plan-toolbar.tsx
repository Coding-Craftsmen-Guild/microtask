import type { ReactNode } from 'react'
import { VIEW_SWITCH } from '../view-switch'

const HINT = 'Choose which rendering of this plan is on screen. The table stays readable either way.'

const TIMELINE = 'Timeline'

const TABLE = 'Table'

const SPACER = 'flex-1'

/** Props for {@link PlanToolbar}. */
export interface PlanToolbarProps {
  /** The group chips, which filter both views at once. */
  readonly groups: ReactNode

  /** The zoom control, which only means anything to the timeline. */
  readonly zoom: ReactNode
}

/**
 * The control strip: which view, which group, which zoom.
 *
 * The three sit on one row because they are the same kind of thing — they change what is on screen
 * and change nothing in the plan — and because a reader adjusting one usually adjusts another. The
 * first revision scattered them: the view tabs and the zoom shared a wrapping flex row with the
 * canvas itself, and the group chips lived up in the page heading beside the plan's name, where they
 * read as metadata rather than as a filter.
 *
 * The radios are here and the panels they govern are two regions down the frame. {@link VIEW_SWITCH}
 * carries why that works and what keeps it working.
 */
export function PlanToolbar({ groups, zoom }: PlanToolbarProps) {
  return (
    <>
      <p className="sr-only" id={VIEW_SWITCH.hintId}>
        {HINT}
      </p>
      <div className={VIEW_SWITCH.tabs} data-slot="view-tabs">
        <input
          aria-describedby={VIEW_SWITCH.hintId}
          className={VIEW_SWITCH.timelineRadio}
          defaultChecked
          id={VIEW_SWITCH.timelineId}
          name="plan-view"
          type="radio"
        />
        <label className={VIEW_SWITCH.timelineTab} htmlFor={VIEW_SWITCH.timelineId}>
          {TIMELINE}
        </label>
        <input
          aria-describedby={VIEW_SWITCH.hintId}
          className={VIEW_SWITCH.tableRadio}
          id={VIEW_SWITCH.tableId}
          name="plan-view"
          type="radio"
        />
        <label className={VIEW_SWITCH.tableTab} htmlFor={VIEW_SWITCH.tableId}>
          {TABLE}
        </label>
      </div>
      {groups}
      <span className={SPACER} />
      {zoom}
    </>
  )
}
