import { VIEW_SWITCH } from '../view-switch'

const HINT = 'Choose which rendering of this plan is on screen. The table stays readable either way.'

const TIMELINE = 'Timeline'

const TABLE = 'Table'

/**
 * Which rendering of the plan is on screen: the timeline, or the table.
 *
 * Two radios and two labels. The panels they govern are a whole region further down the frame and
 * are reached by a `:has()` rule anchored on the shell — {@link VIEW_SWITCH} carries why that is the
 * only selector that can reach from here to there, and why neither view is a client component.
 *
 * It was `PlanToolbar`, which was this plus a spacer plus two slots, back when the control strip was
 * a region of its own. The strip is gone; the head row holds everything it held, and what is left of
 * that component is the one control it actually drew.
 */
export function ViewTabs() {
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
    </>
  )
}
