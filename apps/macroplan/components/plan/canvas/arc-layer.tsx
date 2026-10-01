import { ARC_CLASS, arcKindOf } from './arc-kinds'
import type { CanvasArc } from './arc-view'

/** Props for {@link ArcLayer}. */
export interface ArcLayerProps {
  /** Every dependency of the plan as a curve, from `canvasLayout`. */
  readonly arcs: readonly CanvasArc[]
}

/**
 * Every dependency edge of the plan, drawn once over all the rails.
 *
 * ### One layer, not one group per rail
 *
 * An arc between two rails belongs to neither, so there is no rail group to put it in: whichever end
 * owned it, the arc would be ordered, clipped and dimmed with the wrong rail half the time. It is drawn
 * **before** the rails in `PlanCanvas` so bars and nodes sit on top of it, which is the way a git graph
 * reads — the marks are the subject and the lines are how they are joined.
 *
 * ### Drawn at every rung
 *
 * There is no `draws.arcs`, and `rung-view.ts` argues why: a dependency couples two rails at every
 * scale, and what changes with the rung is only what the arcs connect. Both a bar and a node are placed
 * by the same span, so the arc geometry needs no rung and is told none.
 *
 * ### What the two data attributes are for
 *
 * `data-arc-from` and `data-arc-to` carry the arc's two ends so that selecting a feature in the sidebar
 * can dim every arc that touches neither of them, with the same generated CSS that dims the bars and no
 * JavaScript. An arc has no `data-label-id`: its two ends may be in different groups, and an arc drawn
 * as though it were in one of them would be a claim the plan does not make.
 *
 * Answers `null` rather than an empty `<g>` for a plan with no dependencies, which is most new plans —
 * so the `<defs>` and its three markers are not emitted into the SVG of a plan that references none.
 */
export function ArcLayer({ arcs }: ArcLayerProps) {
  if (arcs.length === 0) return null
  return (
    <g data-slot="arc-layer">
      {arcs.map((arc) => (
        <path
          className={ARC_CLASS[arcKindOf(arc)]}
          d={arc.path}
          data-arc-from={arc.fromId}
          data-arc-kind={arcKindOf(arc)}
          data-arc-to={arc.toId}
          data-label-id={arc.labelId ?? undefined}
          data-slot="arc"
          key={`${arc.fromId}>${arc.toId}`}
          style={arc.colour === null ? undefined : { stroke: arc.colour }}
        />
      ))}
    </g>
  )
}
