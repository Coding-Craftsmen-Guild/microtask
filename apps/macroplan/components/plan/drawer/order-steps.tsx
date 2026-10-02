import { ORDER } from './list-css'
import type { PanelParts } from './panel-parts'
import { PANEL_BANDS } from './panel-words'
import { PlaceControl } from './place-control'
import { placementFor, stepsFor } from './placement'

const GLYPHS = { earlier: String.fromCharCode(0x2190), later: String.fromCharCode(0x2192) } as const

/** Props for {@link OrderSteps}. */
export interface OrderStepsProps {
  /** Everything the panel was handed. */
  readonly parts: PanelParts
}

/**
 * The two moves, between the neighbours they swap this item with.
 *
 * Each is a placement among the item's own siblings, so each is the same write as a drag on the board
 * would be — `stepsFor` works out where the item lands and which of the two is already at an end
 * (`./placement.ts`). The glyphs are arrows and their names are sentences, because an arrow is not a
 * word and "left button" tells a reader nothing about what it moves.
 */
export function OrderSteps({ parts }: OrderStepsProps) {
  const { row, values, controls, actions, planId } = parts
  const placement = placementFor(row.kind, controls, actions)
  if (!placement.placeable) return null
  const ids = values.panel.family.map((one) => one.id)
  return (
    <div className={ORDER.steps}>
      {stepsFor(ids, row.id, values.place.featureId).map((step) => (
        <PlaceControl
          disabled={step.disabled}
          key={step.key}
          kind={row.kind}
          label={step.key === 'up' ? GLYPHS.earlier : GLYPHS.later}
          name={step.key === 'up' ? PANEL_BANDS.earlier : PANEL_BANDS.later}
          parentId={step.parentId}
          placeFeature={placement.placeFeature}
          placeItem={placement.placeItem}
          planId={planId}
          position={step.position}
          subjectId={row.id}
          tone="step"
        />
      ))}
    </div>
  )
}
