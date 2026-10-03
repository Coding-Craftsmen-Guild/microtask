import type { ReactNode } from 'react'
import type { PlanScreenModel } from '../plan-screen-model'
import { HEAD, MENU_CSS } from './shell-css'
import { ViewTabs } from './view-tabs'
import type { PlanView } from '../view-switch'

/** Props for {@link PlanHead}. */
export interface PlanHeadProps {
  readonly plan: PlanScreenModel

  /** The group chips, which filter both views at once. */
  readonly groups: ReactNode

  /** The zoom control, or nothing on a surface that cannot remember a choice. */
  readonly zoom: ReactNode

  /** Whole-plan actions — settings, sharing — already filtered by what this viewer may do. */
  readonly actions: ReactNode

  /** The attention summary, when anything needs looking at. */
  readonly attention: ReactNode

  /** The rendering on screen, which the view tabs choose between. */
  readonly view: PlanView

  /** Choose the other rendering. */
  readonly onView: (view: PlanView) => void
}

/**
 * The one row over the board: what plan this is, how it is being read, and what acts on all of it.
 *
 * ### Why the head and the toolbar are one row
 *
 * They were two, stacked, each with its own padding and its own bottom border — 60-odd pixels of
 * chrome between the plan's name and its first bar, divided at a line no reader could see a reason
 * for. Which view is on screen is as much part of "what am I looking at" as the name above it, and a
 * plan page's job is to be mostly plan.
 *
 * The row wraps rather than scrolling, so a narrow viewport gets the controls under the name instead
 * of a horizontal scrollbar on the page's chrome. {@link HEAD} carries the left-to-right argument.
 *
 * ### The calendar facts
 *
 * Under the name as one muted line rather than as their own paragraph: they are how to read the axis
 * below, and a reader consults them once and then ignores them.
 *
 * ### Why this renders a stylesheet
 *
 * One rule, for Safari's `<summary>` marker, which no utility spells. It is here because this row is
 * what holds the two `<details>` buttons that need it, and it is one static rule rather than
 * anything generated from the plan.
 */
export function PlanHead({ plan, groups, zoom, actions, attention, view, onView }: PlanHeadProps) {
  return (
    <div className={HEAD.row} data-slot="plan-head">
      <style>{MENU_CSS}</style>
      <div className={HEAD.identity}>
        <h1 className={HEAD.title}>{plan.name}</h1>
        <p className={HEAD.meta}>
          <span>{`starts ${plan.startDate}`}</span>
          <span aria-hidden="true">·</span>
          <span>{`${String(plan.sprintLengthDays)}-day sprints`}</span>
          <span aria-hidden="true">·</span>
          <span>{plan.timezone}</span>
          {attention}
        </p>
      </div>
      <div className={HEAD.views}>
        <ViewTabs onView={onView} view={view} />
      </div>
      <span className={HEAD.spacer} />
      <div className={HEAD.controls}>
        {groups}
        {zoom === null ? null : <span aria-hidden="true" className={HEAD.divider} />}
        {zoom}
        <div className={HEAD.actions}>{actions}</div>
      </div>
    </div>
  )
}
