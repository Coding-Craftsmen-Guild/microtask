import { DRAW, STRIPES } from './extend-css'

const STRIPE = 12

/**
 * The hatch the provisional bar is filled with, as a pattern the bar can name.
 *
 * Two rects at 45 degrees, which is the design's `repeating-linear-gradient` written the way SVG takes
 * one. It is defined inside the drawing sheet rather than in the canvas, so a board with no draw in
 * progress carries no `<defs>` at all.
 */
export function DrawStripes() {
  return (
    <defs>
      <pattern
        height={STRIPE}
        id={STRIPES}
        patternTransform="rotate(45)"
        patternUnits="userSpaceOnUse"
        width={STRIPE}
      >
        <rect className={DRAW.stripeOne} height={STRIPE} width={STRIPE / 2} x={0} y={0} />
        <rect className={DRAW.stripeTwo} height={STRIPE} width={STRIPE / 2} x={STRIPE / 2} y={0} />
      </pattern>
    </defs>
  )
}
