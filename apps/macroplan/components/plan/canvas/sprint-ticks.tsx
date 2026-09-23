import type { Plan } from '@repo/api-client'
import { sprintTicks } from '@repo/canvas'
import type { DayRange, PlanScale } from '@repo/canvas'
import { sprintHover } from './hover'
import { LAYOUT, labelX } from './view'

const TICK_LINE = 'stroke-foreground/10'

const TICK_LABEL = 'fill-muted-foreground text-[10px]'

const TICK_TARGET = 'fill-transparent'

const TICK_TOP = 26

/** Props for {@link SprintTickLayer}. */
export interface SprintTickLayerProps {
  /** The plan, read for its `startDate` and `sprintLengthDays` alone. */
  readonly plan: Plan

  /** The scale every x and width is computed at. */
  readonly scale: PlanScale

  /** The working days on screen, which decides which ticks exist. */
  readonly range: DayRange

  /** The canvas's full height, so a gridline runs the length of it. */
  readonly height: number
}

/**
 * One gridline and one `W1–2` label per sprint the viewport touches, and behind them one hover
 * target per sprint carrying the two calendar dates that sprint covers.
 *
 * Spec §3.3: sprints are gridlines, not containers — so a tick is a line at the sprint's own left
 * edge and never a box a bar is drawn inside. The line runs the whole height, which is what makes a
 * bar's start readable against the sprint it falls in.
 *
 * The label is `sprintTicks`' own, week numbers counted from the plan's first week with an en dash,
 * and nothing here reformats it.
 *
 * ### The dates, and why they are an SVG `<title>` on a rect of their own
 *
 * §5: "real calendar dates appear on hover, never as permanent chrome". A `<title>` child is the
 * browser's own hover tooltip, so the date is revealed by pointing and drawn by nothing — and it
 * costs **no client boundary**: this whole screen is a Server Component with nothing to hydrate,
 * which `PlanScreen` argues at length, and a `<title>` keeps it that way where `@repo/ui`'s
 * vendored Radix `tooltip`, which is `'use client'`, would not.
 *
 * ### `aria-hidden`, because the spec that would have made it unnecessary is only advisory
 *
 * A `<title>` names its own shape, and SVG-AAM 1.0 maps a shape with a non-empty direct `<title>`
 * child to `graphics-symbol` — so adding one is precisely what promotes a rect from unnamed
 * geometry to a named node. WAI-ARIA 1.2 does give `img` **Children Presentational: True**, which
 * would prune this whole subtree, but its normative wording is that a user agent *SHOULD NOT*
 * expose descendants, and **Chromium declines it**: read over CDP, these rects come back as named
 * `graphics-symbol` nodes and `TodayMark`'s group as a named `group`, none of them ignored. An
 * earlier version of this note claimed the pruning as a fact and was wrong on the only browser
 * that was checked.
 *
 * So both hover groups carry `aria-hidden="true"` and the guarantee holds by construction rather
 * than by a browser's discretion. It costs no element; the `<svg>`'s own `aria-label` is untouched,
 * because `aria-label` outranks a descendant `<title>` in accname and `PlanCanvas` is still the one
 * thing announced; the `<title>` still resolves for the pointer; and unlike the prose it replaces,
 * it is **observable in happy-dom**, so `plan-hover.test.tsx` pins it instead of arguing it.
 *
 * The target is a **separate transparent rect** rather than the tick's own line, because a
 * gridline is one px wide and one px is not a hover target anybody hits. It spans the sprint's full
 * width and the canvas's full height, so the empty space in a sprint's column and the chrome above
 * it name that sprint's dates.
 *
 * ### It does not reach a solid bar or an item mark, and that is measured rather than assumed
 *
 * An SVG tooltip resolves by walking the **DOM ancestors of the element the pointer hit**, never by
 * paint order. A mark with a painted fill absorbs the pointer, and this rect is behind it rather
 * than one of its ancestors, so it is never consulted. Measured in Chromium, the sentence appears
 * over a column's empty space, over a band label and over a hollow bar's interior — `fill-none`
 * lets the pointer through — and **not** over a solid feature bar, an item mark, or a rail label in
 * the gutter, which no target spans at all. The reveal is therefore uneven by *status*:
 * `TREATMENT_CLASS.solid` absorbs and `hollow` does not, so an unsized feature has a date on hover
 * and a placed one does not.
 *
 * Moving this layer above the rails would even that out and is deliberately not done. Phase 3 is
 * the editing phase, and a full-height transparent rect over every bar would take the pointer from
 * exactly the dragging and clicking that phase adds — a trap laid for the phase that would have to
 * remove it. A bar's own hover belongs there, with the layer order it has to revisit anyway.
 *
 * It is also its own `<g>` rather than a child of each `data-slot="sprint-tick"` group, so a test
 * reading a tick's `textContent` still reads the label alone and can tell the drawn chrome from
 * the revealed date.
 *
 * `tick.from` and `tick.to` go onto the rect **as well as** into the sentence, the way `TodayMark`
 * carries `data-date` beside its line: the sentence is presentation and the attributes are the
 * datum, carried straight from `rangeOfSprint` and never recomputed from an offset. `to` is
 * inclusive — see {@link sprintHover}, which is where that asymmetry is rendered.
 */
export function SprintTickLayer({ plan, scale, range, height }: SprintTickLayerProps) {
  const ticks = sprintTicks(plan, scale, range)
  return (
    <g data-slot="sprint-ticks">
      {ticks.map((tick) => (
        <g data-slot="sprint-tick" data-sprint={tick.sprint} key={tick.sprint}>
          <line className={TICK_LINE} x1={tick.x} x2={tick.x} y1={TICK_TOP} y2={height} />
          <text
            className={TICK_LABEL}
            x={labelX(tick.x, scale, range)}
            y={LAYOUT.chromeHeight - LAYOUT.labelInset}
          >
            {tick.label}
          </text>
        </g>
      ))}
      <g aria-hidden="true" data-slot="sprint-dates">
        {ticks.map((tick) => (
          <rect
            className={TICK_TARGET}
            data-from={tick.from}
            data-slot="sprint-date"
            data-sprint={tick.sprint}
            data-to={tick.to}
            height={height}
            key={tick.sprint}
            width={tick.width}
            x={tick.x}
            y={0}
          >
            <title>{sprintHover(tick)}</title>
          </rect>
        ))}
      </g>
    </g>
  )
}
