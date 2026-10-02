import { EstimateField } from './estimate-field'
import { FIELD_DIVIDER, FIELD_ROW } from './field-css'
import { GroupField } from './group-field'
import type { PanelParts } from './panel-parts'
import { joinPicks } from './pick-list'
import { PlacePicker } from './place-picker'
import { placementFor } from './placement'
import { SprintCell } from './sprint-cell'
import { pairFor } from './subject-writes'

/** Props for {@link IdentityFields}. */
export interface IdentityFieldsProps {
  /** Everything the panel was handed, since every field here reads a different part of it. */
  readonly parts: PanelParts
}

/**
 * The row of fields about this subject: where it sits, how big it is, when it starts, what it is in.
 *
 * ### One row, bottom-aligned, wrapping
 *
 * Four controls side by side rather than four stacked bands, which is the whole reason the panel moved
 * under the board: at 28rem these were a column eight fields deep, and a reader correcting an estimate
 * had to scroll past the name to see the sprint it moved. At the panel's width they fit on one line,
 * each under its own 10px caption, and the row wraps rather than squeezing when the window does not
 * allow it.
 *
 * ### Why the divider
 *
 * The first three fields are facts **about this feature**. Group is a fact about a *set* the feature
 * belongs to — it changes no date, and choosing it lights every other feature in that group — so it is
 * the one control here that does something to the board rather than to the subject. A hairline is the
 * cheapest way to say so.
 *
 * ### What each capability draws, and what it does not
 *
 * Every field is behind its own control flag, and a flag is never a gate: a surface that may not pin
 * draws no sprint stepper rather than a disabled one, and an item draws a pill because an item has no
 * pin to write at all. A seat holding `write` and not `manage` therefore sees a row with the estimate
 * in it and no picker, which is the capability line drawn as layout (`lib/plan-capabilities.ts`).
 */
export function IdentityFields({ parts }: IdentityFieldsProps) {
  const { row, values, controls, actions, planId } = parts
  const feature = row.kind === 'feature'
  const pair = pairFor(row.kind, controls, actions)
  const placement = placementFor(row.kind, controls, actions)
  const parent = feature ? values.place.railId : values.place.featureId
  return (
    <div className={FIELD_ROW} data-slot="identity-fields">
      {placement.placeable && parent !== null ? (
        <PlacePicker
          atTheEnd={values.panel.atTheEnd}
          hereColour={values.panel.hereColour}
          hereName={feature ? row.epic : row.feature}
          kind={row.kind}
          placeFeature={placement.placeFeature}
          placeItem={placement.placeItem}
          planId={planId}
          subjectId={row.id}
          targets={values.place.targets}
        />
      ) : null}
      {pair.estimable ? (
        <EstimateField
          estimate={pair.estimate}
          estimateDays={values.estimateDays}
          kind={row.kind}
          planId={planId}
          subjectId={row.id}
        />
      ) : null}
      <SprintCell parts={parts} />
      {feature && controls.labelFeature ? (
        <>
          <span aria-hidden="true" className={FIELD_DIVIDER} />
          <GroupField
            featureId={row.id}
            labelId={row.labelId}
            options={joinPicks(values.plan.labels)}
            planId={planId}
            setLabel={actions.labelFeature}
          />
        </>
      ) : null}
    </div>
  )
}
