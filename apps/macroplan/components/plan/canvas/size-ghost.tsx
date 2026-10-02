import { dayToX, widthOfDays, type PlanScale } from '@repo/canvas'
import { DrawStripes } from './draw-stripes'
import { CHIP_LIFT, DRAW } from './extend-css'
import type { SizeAim } from './size-view'
import { insideRail, LAYOUT, railTop } from './view'

const REFUSED_BAR = 'fill-none stroke-destructive stroke-[1.5] [stroke-dasharray:4_3]'

const REFUSED_CHIP =
  'pointer-events-none absolute z-30 flex items-center gap-1.5 rounded-[5px] bg-destructive px-2 py-[3px] text-[11px] font-semibold text-white'

/** Props for {@link SizeGhost}. */
export interface SizeGhostProps {
  /** The length the pointer has dragged out. */
  readonly aim: SizeAim

  /** How big the canvas is, so the sheet over it is the same size. */
  readonly box: { readonly width: number; readonly height: number }

  /** What a day is worth in px. */
  readonly scale: PlanScale
}

/**
 * The length a Ctrl-held drag is choosing, before anything is written.
 *
 * The same stripes and the same brand hue the draw ghost uses (`./extend-ghost.tsx`), because both are
 * the same kind of thing: a sentence somebody is still typing, drawn where the real mark will be, in a
 * paint no state of the plan uses. What differs is what the chip says — a length rather than a thing to
 * be made — and that there is no guide line, because a resize chooses a **duration** and not a day:
 * ruling the grid at the dragged edge would promise a date the schedule has not agreed to
 * (`./size-write.ts`).
 *
 * A refused drag — a feature whose length is its items' — is drawn in `destructive`, the colour this
 * canvas already spends on a contradiction, with the chip saying why rather than the bar simply not
 * appearing. A gesture that silently does nothing is the one outcome worth spending a colour to avoid.
 */
export function SizeGhost({ aim, box, scale }: SizeGhostProps) {
  const x = dayToX(aim.fromDay, scale)
  const width = widthOfDays(aim.days, scale)
  const y = insideRail(railTop(aim.lane), 'bar')
  return (
    <>
      <svg
        aria-hidden="true"
        className={DRAW.sheet}
        data-slot="size-ghost"
        focusable="false"
        height={box.height}
        style={{ minWidth: box.width }}
      >
        <DrawStripes />
        <rect
          className={aim.refused ? REFUSED_BAR : DRAW.bar}
          data-refused={aim.refused}
          height={LAYOUT.barHeight}
          rx={4}
          width={Math.max(width, 1)}
          x={x}
          y={y}
        />
      </svg>
      <span
        className={aim.refused ? REFUSED_CHIP : DRAW.chip}
        data-slot="size-chip"
        style={{ left: x, top: y - CHIP_LIFT }}
      >
        {aim.chip}
        <span className={aim.refused ? undefined : DRAW.meta}>{aim.meta}</span>
      </span>
    </>
  )
}
