import { BreakdownLine } from './breakdown-line'
import { DescriptionField } from './description-field'
import { nameOf } from './drawer-heading'
import { FIELD_HINT, META, NAME_PLAIN } from './field-css'
import { IdentityFields } from './identity-fields'
import { NameField } from './name-field'
import type { PanelParts } from './panel-parts'
import { PANEL_GRID } from './panel-css'
import { FIELDS_HINT_ID, metaLine, PANEL_HINTS, scheduleReading } from './panel-words'
import { pairFor } from './subject-writes'

/** Props for {@link IdentityColumn}. */
export interface IdentityColumnProps {
  /** Everything the panel was handed. */
  readonly parts: PanelParts
}

/**
 * The first column: where this subject sits, what it is called, and the fields that change it.
 *
 * ### Reading order, top to bottom
 *
 * The meta line answers *where am I* in one line — the rail or the parent feature, and the days the
 * schedule gave it. The name is next because it is the heading as well as a field. Then the fields
 * row, then the quiet lines under it: what the schedule made of the estimate, whether the items are
 * what sized it, and the one rule a reader cannot deduce from the controls.
 *
 * The `<dl>` of facts this column used to open with is gone, and the fields are why: Epic, Estimate
 * and Sprint were each printed as a read-only fact **and** offered as a field somewhere below, so a
 * reader was given the same four values twice and had to work out which one they could change. Each
 * fact is now the field that writes it, and the only readings left are the two the fields cannot
 * state: the schedule's own arithmetic on a broken-down estimate, and the dates.
 *
 * ### Why the name is still a field even where it cannot be written
 *
 * A read-only surface draws the name as a paragraph at the same size, not a disabled input: the row
 * either has a rename to offer or it does not, and a box nobody can type in is a box that lies about
 * what it is. The two look nearly identical on screen, which is the point — nothing moves when a seat
 * with fewer capabilities opens the same panel.
 */
export function IdentityColumn({ parts }: IdentityColumnProps) {
  const { row, values, controls, actions, planId, description } = parts
  const pair = pairFor(row.kind, controls, actions)
  const reading = scheduleReading(row.estimate, values.estimateDays)
  return (
    <div className={PANEL_GRID.column} data-slot="panel-identity">
      <p className={META} data-slot="panel-meta">
        {metaLine(row.kind === 'feature' ? row.epic : row.feature, values.panel.dates)}
      </p>
      {pair.renamable ? (
        <NameField
          kind={row.kind}
          name={values.name}
          planId={planId}
          rename={pair.rename}
          subjectId={row.id}
        />
      ) : (
        <p className={NAME_PLAIN}>{nameOf(row)}</p>
      )}
      <IdentityFields parts={parts} />
      {reading === '' ? null : (
        <p className={FIELD_HINT} data-slot="estimate-reading">
          {reading}
        </p>
      )}
      <BreakdownLine sizedByItems={values.sizedByItems} />
      <p className={FIELD_HINT} id={FIELDS_HINT_ID}>
        {PANEL_HINTS[row.kind]}
      </p>
      {row.kind === 'item' && description !== null && controls.describeItem ? (
        <DescriptionField
          describe={actions.describeItem}
          description={description}
          itemId={row.id}
          planId={planId}
        />
      ) : null}
    </div>
  )
}
