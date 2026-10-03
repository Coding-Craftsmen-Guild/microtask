import { VIEW_SWITCH, type PlanView } from '../view-switch'

const HINT = 'Choose which rendering of this plan is on screen. The table stays readable either way.'

const TIMELINE = 'Timeline'

const TABLE = 'Table'

/** Props for {@link ViewTabs}. */
export interface ViewTabsProps {
  /** The rendering on screen. */
  readonly view: PlanView

  /** Choose the other one. */
  readonly onView: (view: PlanView) => void
}

/**
 * Which rendering of the plan is on screen: the timeline, or the table.
 *
 * Two radios and two labels, controlled by the screen's own state now that the plan is drawn in the
 * browser (ADR 0069) — choosing one is a re-render and nothing else. {@link VIEW_SWITCH} carries what the
 * radios used to drive instead, and why they are still radios.
 *
 * It was `PlanToolbar`, which was this plus a spacer plus two slots, back when the control strip was
 * a region of its own. The strip is gone; the head row holds everything it held, and what is left of
 * that component is the one control it actually drew.
 */
export function ViewTabs({ view, onView }: ViewTabsProps) {
  return (
    <>
      <p className="sr-only" id={VIEW_SWITCH.hintId}>
        {HINT}
      </p>
      <div className={VIEW_SWITCH.tabs} data-slot="view-tabs">
        <input
          aria-describedby={VIEW_SWITCH.hintId}
          checked={view === 'timeline'}
          className={VIEW_SWITCH.timelineRadio}
          id={VIEW_SWITCH.timelineId}
          name="plan-view"
          onChange={() => onView('timeline')}
          type="radio"
        />
        <label className={VIEW_SWITCH.timelineTab} htmlFor={VIEW_SWITCH.timelineId}>
          {TIMELINE}
        </label>
        <input
          aria-describedby={VIEW_SWITCH.hintId}
          checked={view === 'table'}
          className={VIEW_SWITCH.tableRadio}
          id={VIEW_SWITCH.tableId}
          name="plan-view"
          onChange={() => onView('table')}
          type="radio"
        />
        <label className={VIEW_SWITCH.tableTab} htmlFor={VIEW_SWITCH.tableId}>
          {TABLE}
        </label>
      </div>
    </>
  )
}
