import type { FeaturePlacement, ItemPlacement } from '@repo/api-client'
import { FIELD_CELL, MICRO, PICKER } from './field-css'
import type { SubjectWrite } from './field'
import { ListSearch } from './list-search'
import { PlaceControl } from './place-control'
import type { PlaceTarget, SubjectKind } from './values'

const CARET = String.fromCharCode(0x25be)

interface PickWords {
  readonly label: string
  readonly find: string
  readonly here: string
}

/** What each kind calls its parent, and what the search over the alternatives is called. */
export const PICK_WORDS: Readonly<Record<SubjectKind, PickWords>> = {
  feature: { label: 'Epic', find: 'Search rails', here: 'current' },
  item: { label: 'Feature', find: 'Search features', here: 'current' },
}

/** Props for {@link PlacePicker}. */
export interface PlacePickerProps {
  /** The plan the placement is written to. */
  readonly planId: string

  /** The subject being moved. */
  readonly subjectId: string

  /** Which kind it is: a feature moves between rails, an item between features. */
  readonly kind: SubjectKind

  /** The parent it sits under now, which heads the list and is not offered as a move. */
  readonly hereName: string

  /** That parent's hue, for the swatch on the opener. */
  readonly hereColour: string

  /** Every other parent it could move to, in the order they should be offered. */
  readonly targets: readonly PlaceTarget[]

  /** A position past the end of any parent in this plan, which is where a pick lands. */
  readonly atTheEnd: number

  /** The feature write, unbound. */
  readonly placeFeature: SubjectWrite<FeaturePlacement>

  /** The item write, unbound. */
  readonly placeItem: SubjectWrite<ItemPlacement>
}

/**
 * The parent this subject sits under, and the list of ones it could sit under instead.
 *
 * ### What it replaced, and why a select was the wrong control
 *
 * This was a `select` labelled "Move to another rail", whose first option was "On this rail" and
 * meant nothing. Three things were wrong with that. A rail is a **colour** as much as a name, and a
 * native option list cannot carry the swatch. A plan with thirty rails is a scroll through an
 * unsearchable list. And "Move to another rail" is a sentence about an action, where what a reader
 * wants to see is the field — *which rail is this on* — with the answer in it.
 *
 * So the opener shows the current parent, and opening it searches the alternatives. There is no inert
 * first option: the row for the current parent is the heading of the list, marked `current`, and is
 * not a button at all.
 *
 * ### Why a pick lands at the end
 *
 * A move between parents has to choose a position, and the end is the only one that means anything:
 * the subject has no place among children it has never been beside. It is the same answer the Add
 * strip gives for a dropped feature, and `placeAmong` clamps a position past the end to last, so
 * `atTheEnd` is one number rather than a count per target (`services/positions.ts`).
 *
 * ### Why it opens in flow
 *
 * The panel body scrolls, so a popover absolutely positioned inside it is clipped at the bottom edge
 * with no way to reach the rest of the list. Opening this pushes the fields under it down, which is
 * the same decision the design makes for the dependency search and for the same reason.
 */
export function PlacePicker(props: PlacePickerProps) {
  const { planId, subjectId, kind, hereName, hereColour, targets, atTheEnd } = props
  const words = PICK_WORDS[kind]
  return (
    <div className={FIELD_CELL} data-slot="place-picker">
      <span className={MICRO}>{words.label}</span>
      <details className={PICKER.root}>
        <summary className={PICKER.opener}>
          {hereColour === '' ? null : (
            <span className={PICKER.swatch} style={{ backgroundColor: hereColour }} />
          )}
          <span className={PICKER.name}>{hereName}</span>
          <span className={PICKER.caret}>{CARET}</span>
        </summary>
        <div className={PICKER.panel} data-slot="pick-panel">
          <ListSearch hint={words.find} label={words.find} />
          <div className={PICKER.rows}>
            <p className={PICKER.row} data-pick-row data-search={hereName.toLowerCase()}>
              {hereColour === '' ? null : (
                <span className={PICKER.swatch} style={{ backgroundColor: hereColour }} />
              )}
              <span className={PICKER.name}>{hereName}</span>
              <span className={PICKER.caret}>{words.here}</span>
            </p>
            {targets.map((target) => (
              <div data-pick-row data-search={target.name.toLowerCase()} key={target.id}>
                <PlaceControl
                  colour={target.colour}
                  disabled={false}
                  kind={kind}
                  label={target.name}
                  parentId={target.id}
                  placeFeature={props.placeFeature}
                  placeItem={props.placeItem}
                  planId={planId}
                  position={atTheEnd}
                  subjectId={subjectId}
                  tone="row"
                />
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
