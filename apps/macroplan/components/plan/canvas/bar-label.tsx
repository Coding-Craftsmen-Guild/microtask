import type { BarLabel } from '@repo/canvas'
import { insideRail, LAYOUT } from './view'

const INSIDE = 'pointer-events-none fill-white text-[11px] font-medium'

const OUTSIDE = 'pointer-events-none fill-foreground text-[11px]'

const ELLIPSIS = '…'

/**
 * A name cut to the budget {@link BarLabel.maxChars} allows, with an ellipsis when it was cut.
 *
 * Truncating here rather than with CSS because SVG has no `text-overflow`: the only ways to clip
 * `<text>` are a per-element `clipPath`, which is one extra node per bar, or `textLength`, which
 * squashes the glyphs rather than dropping them. Counting characters against a measured average is
 * what `barLabels` budgeted for.
 */
export const cut = (name: string, maxChars: number): string =>
  name.length <= maxChars ? name : `${name.slice(0, Math.max(0, maxChars - 1)).trimEnd()}${ELLIPSIS}`

/** Props for {@link BarLabelText}. */
export interface BarLabelTextProps {
  readonly label: BarLabel

  readonly name: string

  readonly top: number
}

/**
 * One bar's name, on the bar or after it.
 *
 * Returns nothing when there is no room, which happens to a short bar wedged against its neighbour.
 * Drawing it anyway would put one feature's name across another feature's bar, and that reads as a
 * mislabelled chart rather than as a crowded one.
 *
 * `pointer-events-none` on both: the text sits over the bar, and a label that swallowed the
 * pointer would be a hole in the drag target exactly where the bar is easiest to hit.
 */
export function BarLabelText({ label, name, top }: BarLabelTextProps) {
  if (label.maxChars <= 0 || name === '') return null
  return (
    <text
      className={label.inside ? INSIDE : OUTSIDE}
      data-slot="bar-label"
      dominantBaseline="central"
      x={label.x}
      y={insideRail(top, 'bar') + LAYOUT.barHeight / 2}
    >
      {cut(name, label.maxChars)}
    </text>
  )
}
