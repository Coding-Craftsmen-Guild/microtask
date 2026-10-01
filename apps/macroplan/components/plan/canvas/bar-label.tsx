import type { BarLabel } from '@repo/canvas'
import { insideRail, LAYOUT } from './view'

const INSIDE = 'pointer-events-none fill-foreground text-[11px] font-medium'

const OUTSIDE = 'pointer-events-none fill-foreground text-[11px]'

const ELLIPSIS = '…'

const MIN_READABLE = 4

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

  /**
   * The group its feature is in, or `null` for one in no group.
   *
   * Drawn nowhere and read by one generated rule: choosing a group dims every mark outside it by
   * slot (`labels/group-css.ts`), and a name is a mark. Without this the feature's **name** stayed
   * bright over its own dimmed bar, which reads as a rendering fault rather than as a selection.
   */
  readonly labelId: string | null

  /** What a hover over this feature says, joined, so pointing at a name answers as its bar does. */
  readonly detail: string | null

  /**
   * The feature this label names, which is what a hover lights.
   *
   * A label carries its feature's id and not its own, there being no such thing: it is the one part of
   * a feature's thread that is text, and pointing at the words is pointing at the work.
   */
  readonly hoverId: string
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
 *
 * ### Nothing, rather than a stub
 *
 * Under four characters `cut` has nothing left to keep and returns a letter and an ellipsis, which
 * names no feature and reads as a rendering fault — four crowded features on one rail drew as two
 * dots, a bare "…", a dot, and one readable name. Silence is the better answer: the name is one
 * hover away, it is in the tree on the left, and it is in the table, and a stub is in the way of the
 * very mark it was meant to label.
 *
 * ### Dark text inside, not white
 *
 * A bar is a translucent wash inside an outline rather than a slab of colour, so white text on one
 * is white text on the page — invisible on every rail whatever hue it carries.
 */
export function BarLabelText(props: BarLabelTextProps) {
  const { label, name, top, labelId, detail, hoverId } = props
  if (label.maxChars < MIN_READABLE || name === '') return null
  return (
    <text
      className={label.inside ? INSIDE : OUTSIDE}
      data-detail={detail ?? undefined}
      data-hover-id={hoverId}
      data-label-id={labelId ?? undefined}
      data-slot="bar-label"
      dominantBaseline="central"
      x={label.x}
      y={insideRail(top, 'bar') + LAYOUT.barHeight / 2}
    >
      {cut(name, label.maxChars)}
    </text>
  )
}
