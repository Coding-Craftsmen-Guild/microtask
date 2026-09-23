import type { Plan } from '@repo/api-client'
import { todayLine } from '@repo/canvas'
import type { PlanScale } from '@repo/canvas'

const TODAY_STROKE = 'stroke-gold-deep stroke-2'

/** Props for {@link TodayMark}. */
export interface TodayMarkProps {
  /** The plan, whose own `timezone` decides what date today is. */
  readonly plan: Plan

  /** The scale the x is computed at. */
  readonly scale: PlanScale

  /** The instant to read the clock at, passed in so this render is a function of its arguments. */
  readonly at: Date

  /** The canvas's full height, so the line crosses every rail. */
  readonly height: number
}

/**
 * The today line, or nothing at all.
 *
 * The instant is a prop and there is no `new Date()` here, which is what `todayLine` asks for and
 * what lets a test pin a fixed date: "A caller reads the clock; this reads the caller." The page
 * reads it once and hands it down, so the whole canvas agrees about what day it is.
 *
 * `null` means **one** thing — this runtime cannot resolve the plan's own timezone, a tz-database
 * mismatch between the Node that wrote the plan and the one drawing it — and the answer to it is to
 * draw the plan and draw no today line. Every band, tick and bar beside it is still correct, because
 * none of them reads a zone. An *invalid* instant throws instead, and deliberately: an absent line
 * read as a tz mismatch when the real cause was a bad clock read is a bug no deploy would fix.
 *
 * The date is on the group as a `data-date`, not drawn. It is the one calendar date on the canvas and
 * §5 keeps calendar dates off the permanent chrome; the attribute is what Task 14's hover reads and
 * what a test asserts the weekend rounding through — `dateToDay` gives a Saturday, a Sunday and the
 * Monday after them one offset, so a line drawn at the weekend lands on the left edge of Monday.
 */
export function TodayMark({ plan, scale, at, height }: TodayMarkProps) {
  const today = todayLine(plan, at, scale)
  if (today === null) return null
  return (
    <g data-date={today.date} data-day={today.day} data-slot="today">
      <line className={TODAY_STROKE} x1={today.x} x2={today.x} y1={0} y2={height} />
    </g>
  )
}
