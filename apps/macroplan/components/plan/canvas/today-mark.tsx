import type { Plan } from '@repo/api-client'
import { todayLine } from '@repo/canvas'
import type { PlanScale } from '@repo/canvas'
import { todayHover } from './hover'

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
 * §5 keeps calendar dates off the permanent chrome; the attribute is what the hover reads, and
 * carrying it **beside** `data-day` rather than deriving it from the offset is the point. Three
 * calendar dates share each weekend-adjacent offset: `dateToDay` rounds a Saturday, a Sunday and the
 * Monday after them onto one day, so a line drawn at the weekend lands on the left edge of Monday,
 * where no work has started. That reads as an off-by-one to anyone who has not been told and is the
 * correct answer, because the axis is working days and a Saturday has no offset to occupy. A tooltip
 * that stored the offset and rendered a date back from it would say Monday for a Saturday hover, and
 * `plan-canvas.test.tsx` pins both halves: the three instants share one `data-day` and one x, and each
 * keeps its own `data-date`.
 *
 * The `<title>` is that same `data-date` read out as a sentence, and it is the reveal §5 asks for:
 * a browser's own hover tooltip, which draws nothing until pointed at and needs no client boundary
 * to do it. It is built by {@link todayHover} from the **date string alone** — `today.day` is never
 * handed to it — so the Saturday case cannot come back as Monday, and the sentence says outright
 * why the line is not under the date it names.
 *
 * The group carries `aria-hidden="true"` for the reason `SprintTickLayer` sets out at length: a
 * `<title>` names its own shape, `role="img"` on the `<svg>` is documented to prune its subtree but
 * only as a *SHOULD NOT*, and Chromium exposes this group as a named `group` regardless. Hiding it
 * explicitly keeps `PlanCanvas`'s single `aria-label` the whole of what is announced, and does it by
 * construction rather than by trusting a user agent.
 *
 * Its hover target is the line itself, which is two px wide and is a small thing to hit. The
 * sprint's own full-height target sits directly behind it, so a pointer that misses the line still
 * lands on that sprint's dates **wherever nothing else is painted** — but a solid bar or an item
 * mark under the line absorbs the pointer and reveals nothing, because an SVG tooltip walks the hit
 * element's ancestors and not the paint order. `SprintTickLayer` measures which surfaces reach it.
 */
export function TodayMark({ plan, scale, at, height }: TodayMarkProps) {
  const today = todayLine(plan, at, scale)
  if (today === null) return null
  return (
    <g aria-hidden="true" data-date={today.date} data-day={today.day} data-slot="today">
      <title>{todayHover(today.date)}</title>
      <line className={TODAY_STROKE} x1={today.x} x2={today.x} y1={0} y2={height} />
    </g>
  )
}
