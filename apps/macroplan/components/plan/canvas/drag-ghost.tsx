import { ghostAt, type Held } from './selection'
import { LAYOUT } from './view'

const OVERLAY = 'pointer-events-none absolute top-0 left-0 block'

const GHOST = 'fill-none stroke-foreground stroke-2 [stroke-dasharray:4_3]'

const REFUSED = 'fill-none stroke-destructive stroke-2 [stroke-dasharray:4_3]'

const GHOST_RADIUS = 3

/** Props for {@link DragGhost}. */
export interface DragGhostProps {
  /**
   * The drag in progress: what was grabbed, the box it is being dragged on, and how far it has gone.
   *
   * The whole object rather than five numbers, because this is **not** a client boundary — it declares no
   * state, no effect and no handler, and reaches the browser only because `./drag-root.tsx` imports it, as
   * `../drawer/field-shell.tsx` argues of itself. The primitives-only rule
   * (`../module-boundaries.test.tsx`) is about what crosses into a client component's props, and the
   * boundary here is `DragRoot`'s.
   */
  readonly held: Held

  /** Whether the point under it names no placement, in which case letting go cancels. */
  readonly refused: boolean
}

/**
 * The bar being dragged, as one outlined rect over the canvas it came from.
 *
 * ### A second `<svg>` at the same `viewBox`, which is what places it without measuring
 *
 * The canvas is server-rendered and this cannot be a rect inside it: `./drag-root.tsx` is handed that
 * markup as `children` and may not reach into it. So the ghost is its own `<svg>`, absolutely positioned
 * at the canvas's top left and given the canvas's **own** `viewBox`, `width` and `height` — read off the
 * element itself rather than passed alongside, so the two cannot disagree. Under one `viewBox` a user unit
 * is the same distance in both, and this rect's `x` and `y` are the dragged bar's own coordinates plus the
 * pointer's travel. No `getBoundingClientRect` and no `getCTM` is involved in placing it, which is what
 * lets a test assert where it landed: `happy-dom` answers the first with a zero `DOMRect` and the second
 * with an identity matrix, so a ghost positioned by measurement would be asserted against zeroes that
 * always agree (ADR 0055).
 *
 * `pointer-events-none` is load-bearing rather than tidiness. A painted sheet over the bars is the thing
 * phase 2 ruled out — `./feature-bar.tsx`: it "would swallow the drag and the click it adds" — and an
 * overlay that took the pointer would do exactly that from the moment a drag started, taking the
 * `pointerup` that ends it with it.
 *
 * ### One rect, and not a preview of the schedule
 *
 * §5 puts a feature on the timeline as one rect, and a ghost of it is one rect: `LAYOUT.barHeight`, the
 * dragged bar's own width, and no label. It is **not** a preview of the spans the drop would produce.
 * Re-running the forward pass per pointer move is affordable — spec §3.4 measures it at "the order of 10^5
 * operations and sub-millisecond" — but `schedule()` reads a whole `PlanStructure`, and a plan may not
 * cross into a client component at all (`../module-boundaries.test.tsx`, ADR 0033). So the two
 * instructions cannot both be met, and this is the half that can: where the bar is, and whether letting go
 * would do anything.
 *
 * `aria-hidden` because it is the pointer's own feedback and a reader has the drawer's `Move up` and `Move
 * down` instead — this affordance exists only under a pointer, and ADR 0056 records that there is no a11y
 * tooling here to pretend otherwise with. `focusable="false"` keeps IE-era SVG focus out of the tab order,
 * as the canvas's own layers do.
 *
 * The refused paint is the same dashed outline in `destructive`, the colour this canvas already spends on a
 * contradiction (`./treatments.ts`). It says the drop names no placement — the chrome band, the gutter,
 * below the last rail, or a rail no epic claims — for which `dropTargetFor` answers `null` and a caller
 * cancels, "nothing clamps to the nearest rail".
 */
export function DragGhost({ held, refused }: DragGhostProps) {
  const spot = ghostAt(held)
  return (
    <svg
      aria-hidden="true"
      className={OVERLAY}
      data-slot="drag-ghost"
      focusable="false"
      height={held.box.height}
      viewBox={held.box.viewBox}
      width={held.box.width}
    >
      <rect
        className={refused ? REFUSED : GHOST}
        data-refused={refused}
        height={LAYOUT.barHeight}
        rx={GHOST_RADIUS}
        width={held.grabbed.width}
        x={spot.x}
        y={spot.y}
      />
    </svg>
  )
}
