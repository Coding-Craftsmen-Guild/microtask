import { isMilestone } from '@repo/canvas'
import type { FeatureBar, Treatment } from '@repo/canvas'
import type { CSSProperties } from 'react'
import { LINE } from './line-css'
import { fitLabel } from './mark-label'
import { DIAMOND } from './mark-metrics'
import { insideRail } from './view'

const LABEL_GAP = 10

const LABEL_PAD = 5

const LABEL_BUDGET = 24

const LABEL_BASELINE = 3.5

const PLATE_HEIGHT = 12

const CHAR = 5.5

const FALLBACK = 'var(--color-chart-3)'

const hueOf = (colour: string | null): CSSProperties =>
  ({
    '--mark-hue': colour ?? FALLBACK,
    '--mark-ink': colour === null ? FALLBACK : `color-mix(in oklch, ${colour} 60%, black)`,
  }) as CSSProperties

const diamondAt = (x: number, y: number, r: number): string =>
  [`${String(x)},${String(y - r)}`, `${String(x + r)},${String(y)}`, `${String(x)},${String(y + r)}`, `${String(x - r)},${String(y)}`].join(' ')

/** Props for {@link FeatureLine}. */
export interface FeatureLineProps {
  readonly bar: FeatureBar

  readonly colour: string | null

  readonly treatment: Treatment

  readonly top: number

  readonly labelId: string | null

  /** What a hover over this mark says, joined, or `null` where nothing worded it. */
  readonly detail: string | null

  /** The id of the feature whose thread this mark belongs to, which is what a hover lights. */
  readonly hoverId: string

  /** The feature's own name, cut to the line's width or dropped where it will not fit. */
  readonly name: string
}

/**
 * One feature at the Sprint stop: a rule between two diamonds, with its name over the start of it.
 *
 * ### Why a line and not a bar
 *
 * Its **items** are the bars at this stop, and two rows of filled bars one above the other is a band
 * that reads as eight pieces of work rather than as one with four parts. A line says the same span in
 * a channel the bars are not using — and the diamonds say where it begins and ends, which is the one
 * thing a bar's edges said that a rule alone would not.
 *
 * The span is the feature's own, straight off the layout. It is **not** derived from its items: a
 * feature's estimate is its own until its children outweigh it (ADR 0051), so a line drawn from the
 * first item to the last would silently disagree with the bar the wider stops draw.
 *
 * ### Why the hue is a custom property here and an inline `fill` elsewhere
 *
 * `treatments.ts` records the rule: a hue comes from the plan, Tailwind's scanner reads class names
 * as text, so the class fixes the *treatment* and an inline value fixes the hue. A bar is one element
 * and takes that inline value directly. A line is **four** — a rule, two diamonds, a plate and a
 * label — each wanting the hue in a different channel, and an inline style would have to be written
 * onto each of them while the class beside it set the same property and won.
 *
 * So the hue lands once, on the group, as `--mark-hue`, and each child spends it through a class the
 * scanner can see. The fallback for a rail no epic claims is in the property rather than in a
 * competing class, which is what stops a default quietly outranking a real colour.
 *
 * ### Why the label has a white plate under it
 *
 * It sits **on** the line, so without one the rule runs through the words. The plate is sized from
 * the same character budget the text is cut to, which keeps it from being a white box wider than the
 * name inside it (`./mark-label.ts`).
 */
export function FeatureLine(props: FeatureLineProps) {
  const { bar, colour, treatment, top, labelId, detail, hoverId, name } = props
  const y = insideRail(top, 'line')
  const label = fitLabel(name, bar.width - LABEL_BUDGET, LABEL_PAD * 2, 'line')
  return (
    <g
      data-detail={detail ?? undefined}
      data-end-day={bar.endDay}
      data-feature-id={bar.id}
      data-hover-id={hoverId}
      data-label-id={labelId ?? undefined}
      data-milestone={isMilestone(bar) ? 'true' : undefined}
      data-slot="feature-bar"
      data-start-day={bar.startDay}
      data-treatment={treatment}
      data-width={bar.width}
      data-x={bar.x}
      data-y={y}
      style={hueOf(colour)}
    >
      <line className={LINE.rule} x1={bar.x} x2={bar.x + bar.width} y1={y} y2={y} />
      {[bar.x, bar.x + bar.width].map((at, end) => (
        <polygon className={LINE.diamond} key={end} points={diamondAt(at, y, DIAMOND.rest)} />
      ))}
      {label === '' ? null : (
        <>
          <rect
            className={LINE.plate}
            height={PLATE_HEIGHT}
            width={label.length * CHAR + LABEL_PAD * 2}
            x={bar.x + LABEL_GAP}
            y={y - PLATE_HEIGHT / 2}
          />
          <text className={LINE.label} x={bar.x + LABEL_GAP + LABEL_PAD} y={y + LABEL_BASELINE}>
            {label}
          </text>
        </>
      )}
    </g>
  )
}
